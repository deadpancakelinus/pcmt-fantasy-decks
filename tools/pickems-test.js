// Checks the Pick'ems database rules (setup/pickems-setup.sql) in a throwaway Postgres database:
// who can pick while it is closed, locks, which teams and scores are allowed, standings and the Credits payout.
//   node tools/pickems-test.js <psql command, e.g. "psql -h /tmp/pg -p 5499 -U postgres">
const fs = require('fs'), { execFileSync } = require('child_process');
const PSQL = process.argv[2].split(' ');
const sql = (q, db = 'pktest') => execFileSync(PSQL[0], PSQL.slice(1).concat(['-d', db, '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1']), { input: q, encoding: 'utf8', maxBuffer: 1 << 28 });
let bad = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) bad++; };
const fails = (q, re) => { try { sql(q); return false; } catch (e) { return re ? re.test(String(e.stderr || e.message)) : true; } };
const as = (uid, q) => `set role authenticated; set test.uid = '${uid}'; ${q}`;
const STAFF = '00000000-0000-0000-0000-0000000000f1', ADMIN = '00000000-0000-0000-0000-00000000000a', P1 = '00000000-0000-0000-0000-000000000001', P2 = '00000000-0000-0000-0000-000000000002';
const lit = s => "'" + s.replace(/'/g, "''") + "'";
const JS = fs.readFileSync(__dirname + '/../pickems.js', 'utf8');
const pick = (uid, n, team, w, l) => sql(as(uid, `select public.save_pick('emea-s2', ${n}, ${team === null ? 'null' : lit(team)}, ${w}, ${l});`)).trim();
const ingest = js => sql(`select public.pickem_ingest(${lit(js)});`).trim();
// Changes one series of the bracket file (start / score), like the match check does.
const edit = (js, n, patch) => {
  const s = js.indexOf('var PCMT_PICKEMS = ') + 19, e = js.indexOf('];', s) + 1, data = JSON.parse(js.slice(s, e));
  Object.assign(data[0].series.find(x => x.n === n), patch);
  return js.slice(0, s) + JSON.stringify(data, null, 2) + js.slice(e);
};

sql('drop database if exists pktest;', 'postgres'); sql('create database pktest;', 'postgres');
sql(`create schema auth; create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;`);
sql(fs.readFileSync(__dirname + '/../setup/supabase-setup.sql', 'utf8'));
const vp = fs.readFileSync(__dirname + '/../setup/vp-setup.sql', 'utf8'); sql(vp.slice(0, vp.indexOf('-- [supabase-only]')));
const pk = fs.readFileSync(__dirname + '/../setup/pickems-setup.sql', 'utf8').split('-- [supabase-only]')[0]; sql(pk); sql(pk); // safe to run twice
sql(`insert into auth.users (id) values ('${STAFF}'), ('${ADMIN}'), ('${P1}'), ('${P2}');
insert into public.freshbatch_staff (user_id) values ('${STAFF}'); insert into public.pcmt_admins values ('${ADMIN}');
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on public.pickem_picks, public.vp_ledger, public.pickem_events to authenticated;`);

check(fails(as(STAFF, `select public.save_pick('emea-s2', 2, 'NATS', 2, 1);`), /hasn't loaded/), 'no picks before the bracket is on the server');
const first = JSON.parse(ingest(JS));
check(first.payouts === 0, 'first sync pays nothing (no picks yet)');
const resolved = JSON.parse(sql(`select public.pickem_resolve(data) from public.pickem_state;`).trim());
const by = n => resolved.find(x => x.n === n);
check(by(1).winner === 'XTC' && by(6).winner === 'SEAL' && by(7).winner === 'HOT', 'played series have the right winners');
check(by(3).a === 'SOG' && by(3).b === 'XTC' && by(8).a === 'NOOT' && by(8).b === 'SEAL' && by(9).b === 'HOT' && by(9).a === null, 'winners and losers move on to the right series');
check(by(1).locked && by(6).locked && !by(2).locked && !by(14).locked, 'played series are locked, upcoming ones are open');

check(fails(as(P1, `select public.save_pick('emea-s2', 2, 'NATS', 2, 1);`), /isn't open yet/), 'players cannot pick while it is closed');
check(fails(`set role anon; select public.save_pick('emea-s2', 2, 'NATS', 2, 1);`), 'logged out cannot pick');
check(pick(STAFF, 2, 'NATS', 2, 1) === 't' && pick(ADMIN, 2, 'ATLC', 2, 0) === 't', 'staff and admins can pick while it is closed');
check(fails(as(STAFF, `select public.save_pick('emea-s2', 1, 'XTC', 2, 0);`), /locked/), 'a played series cannot be picked');
check(fails(as(STAFF, `select public.save_pick('emea-s2', 3, 'NIP', 2, 0);`), /isn't playing/), 'a known series only takes its two teams');
check(pick(STAFF, 5, 'NIP', 2, 1) === 't', 'a series with teams not known yet takes any team in the bracket');
check(fails(as(STAFF, `select public.save_pick('emea-s2', 5, 'T1', 2, 1);`), /isn't in this bracket/), 'teams from outside the bracket are refused');
check(pick(STAFF, 14, 'SOG', 'null', 'null') === 't' && sql(`select count(*) from public.pickem_picks where win_maps is not null or lose_maps is not null;`).trim() === '0', 'picks are the winner only (any score sent is ignored)');
check(pick(STAFF, 5, 'XTC', 'null', 'null') === 't' && sql(`select winner from public.pickem_picks where user_id = '${STAFF}' and series = 5;`).trim() === 'XTC', 'a pick can be changed before it locks');
check(pick(STAFF, 5, null, 'null', 'null') === 'f' && sql(`select count(*) from public.pickem_picks where user_id = '${STAFF}' and series = 5;`).trim() === '0', 'a pick can be cleared');

sql(`update public.pickem_events set open = true where id = 'emea-s2';`);
check(pick(P1, 2, 'ATLC', 2, 1) === 't' && pick(P2, 2, 'NATS', 2, 0) === 't', 'everyone can pick once it is open');
check(sql(as(P1, `select count(*) from public.pickem_picks;`)).trim() === '1' && sql(`set role anon; select count(*) from public.pickem_picks;`).trim() === '0', 'everyone sees only their own picks');
check(fails(as(P1, `insert into public.pickem_picks values ('${P1}', 'emea-s2', 1, 'XTC', 2, 0, now());`)) && fails(as(P1, `update public.pickem_picks set series = 1;`)) === false &&
      sql(`select count(*) from public.pickem_picks where series = 1;`).trim() === '0', 'picks cannot be written past save_pick');
check(fails(as(P1, `update public.pickem_events set credits_win = 9999;`)) === false && sql(`select credits_win from public.pickem_events;`).trim() === '20', 'players cannot change the Credits amounts');
check(fails(as(STAFF, `select public.pickem_ingest('x');`)) && fails(as(P1, `select public.pickem_sync();`)), 'nobody can run the sync or payout from the site');
check(fails(as(P1, `insert into public.vp_ledger (user_id, kind, amount) values ('${P1}', 'pickem', 500);`)), 'players cannot pay themselves');

// The series starts: picks lock.
let js2 = edit(JS, 2, { start: '2020-01-01T00:00:00Z' });
ingest(js2);
check(fails(as(P1, `select public.save_pick('emea-s2', 2, 'NATS', 2, 1);`), /locked/), 'a series locks when it starts');
// It finishes NATS 2-1: payout.
js2 = edit(js2, 2, { score: [2, 1] });
const pay = JSON.parse(ingest(js2));
check(pay.payouts === 2 && pay.credits === 40, 'right winners are paid 20 Credits each');
const led = sql(`select user_id || ':' || amount from public.vp_ledger where kind = 'pickem' order by user_id;`).trim().split('\n');
check(led.join(',') === `${P2}:20,${STAFF}:20`, 'right winners get 20, wrong winners get nothing');
check(JSON.parse(ingest(js2)).payouts === 0 && sql(`select count(*) from public.vp_ledger where kind = 'pickem';`).trim() === '2', 'running the sync again never pays twice');
check(sql(as(P1, `select count(*) from public.vp_ledger;`)).trim() === '0' && sql(as(STAFF, `select count(*) from public.vp_ledger;`)).trim() === '1', 'each player sees only their own Credits lines');
const st = sql(`set role anon; select user_id || ':' || points || ':' || correct || ':' || exact from public.pickem_standings('emea-s2') order by points desc, user_id;`).trim().split('\n');
check(st.join(',') === `${P2}:1:1:0,${STAFF}:1:1:0,${ADMIN}:0:0:0,${P1}:0:0:0`.split(',').sort((a, b) => b.split(':')[1] - a.split(':')[1] || a.localeCompare(b)).join(','), 'standings: 1 point for each right winner');
const r2 = JSON.parse(sql(`select public.pickem_resolve(data) from public.pickem_state;`).trim());
check(r2.find(x => x.n === 4).b === 'NATS' && r2.find(x => x.n === 9).a === 'ATLC', 'the result moves teams on through the bracket');

console.log(bad ? `${bad} check(s) failed` : 'all pick\'ems checks passed');
process.exit(bad ? 1 : 0);
