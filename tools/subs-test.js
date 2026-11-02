// Checks subs (backend.html, Subs tab) in a throwaway Postgres database: who can add and remove them, and that the
// database (vp_apply_subs, used by the VP payout) and the site (applySubs in league.js) move the same numbers to the
// same players, so a sub's points score the same on The Deck, the Leaderboard and in Credits.
//   node tools/subs-test.js <psql command, e.g. "psql -h /tmp/pg -p 5499 -U postgres"> <built players.js>
const fs = require('fs'), vm = require('vm'), { execFileSync } = require('child_process');
const PSQL = process.argv[2].split(' '), PLAYERS_JS = fs.readFileSync(process.argv[3], 'utf8');
const sql = (q, db = 'subtest') => execFileSync(PSQL[0], PSQL.slice(1).concat(['-d', db, '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1']), { input: q, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'pipe'] });
let bad = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) bad++; };
const fails = q => { try { sql(q); return false; } catch (e) { return true; } };
const as = (uid, q) => `set role authenticated; set test.uid = '${uid}'; ${q}`;
const lit = s => "'" + String(s).replace(/'/g, "''") + "'";
const STAFF = '00000000-0000-0000-0000-0000000000f1', ADMIN = '00000000-0000-0000-0000-00000000000a', P1 = '00000000-0000-0000-0000-000000000001';

// ---- database ----
sql('drop database if exists subtest;', 'postgres'); sql('create database subtest;', 'postgres');
sql(`create schema auth; create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;`);
sql(fs.readFileSync(__dirname + '/../setup/supabase-setup.sql', 'utf8'));
const vp = fs.readFileSync(__dirname + '/../setup/vp-setup.sql', 'utf8'); sql(vp.slice(0, vp.indexOf('-- [supabase-only]')));
const paste = fs.readFileSync(__dirname + '/../setup/subs-setup.sql', 'utf8'); sql(paste); sql(paste);   // the paste-in file, twice: safe to re-run
sql(`insert into auth.users (id) values ('${STAFF}'), ('${ADMIN}'), ('${P1}');
insert into public.freshbatch_staff (user_id) values ('${STAFF}'); insert into public.pcmt_admins values ('${ADMIN}');
grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, delete on public.player_subs to authenticated; grant usage on all sequences in schema public to authenticated;`);

// ---- who can add and remove subs ----
// W = the gameweek running now (vp_week_start), so these checks hold whenever the test runs; PAID = a week already paid.
const W = 'public.vp_week_start(now())', PAID = "public.vp_week_start(now() - interval '14 days')";
sql(as(STAFF, `insert into public.player_subs (sub, player, week) values ('nana', 'dovie', ${W});`));
check(sql(`select created_by from public.player_subs where sub = 'nana';`).trim() === STAFF, 'staff can add a sub; it records who added it');
check(!fails(as(ADMIN, `insert into public.player_subs (sub, player, week) values ('someone', 'eva', ${W});`)), 'site admins can add a sub');
check(fails(as(P1, `insert into public.player_subs (sub, player, week) values ('x', 'eva', ${W});`)), 'players cannot add subs');
check(fails(`set role anon; insert into public.player_subs (sub, player, week) values ('x', 'eva', ${W});`), 'logged-out visitors cannot add subs');
check(fails(as(STAFF, `insert into public.player_subs (sub, player, week, created_by) values ('y', 'eva', ${W}, '${P1}');`)), 'nobody can add a sub in someone else\'s name');
check(fails(as(STAFF, `insert into public.player_subs (sub, player, week) values ('Nana', 'eva', ${W});`)), 'sub names are stored in lower case');
check(fails(as(STAFF, `insert into public.player_subs (sub, player, week) values ('nana', 'dovie', ${W});`)), 'the same sub can\'t be added twice in one gameweek');
check(!fails(as(STAFF, `insert into public.player_subs (sub, player, week) values ('nana', 'dovie', public.vp_week_end(${W}));`)), 'the same sub can be added again for next gameweek');
check(fails(as(STAFF, `insert into public.player_subs (sub, player, week) values ('z', 'eva', ${PAID});`)), 'no sub can be added to a gameweek whose points are paid');
check(fails(as(STAFF, `insert into public.player_subs (sub, player, week) values ('z', 'eva', ${W} + interval '1 hour');`)), 'week must be the start of a gameweek');
check(fails(as(STAFF, `insert into public.player_subs (sub, player) values ('z', 'eva');`)), 'every sub needs its gameweek');
sql(`insert into public.player_subs (sub, player, week) values ('old', 'eva', ${PAID});`);   // as if saved back then
sql(as(STAFF, `delete from public.player_subs where sub = 'old';`));
check(sql(`select count(*) from public.player_subs where sub = 'old';`).trim() === '1', 'a sub in a paid gameweek can\'t be removed (its points stay)');
sql(as(P1, `delete from public.player_subs;`));
check(sql(`select count(*) from public.player_subs;`).trim() === '4', 'players cannot remove subs');
check(sql(`set role anon; select count(*) from public.player_subs;`).trim() === '4', 'anyone can read subs (the site needs them)');
sql(as(ADMIN, `delete from public.player_subs where sub = 'someone';`));
check(sql(`select count(*) from public.player_subs;`).trim() === '3', 'staff and admins can remove a sub in a gameweek not yet paid');
sql(`delete from public.player_subs; insert into public.player_subs (sub, player, week) values ('nana', 'dovie', '2026-10-29 09:00+00');`);

// ---- the site's applySubs and seriesPoints, straight from league.js ----
const LEAGUE = fs.readFileSync(__dirname + '/league.js', 'utf8');
const between = (a, b) => { const i = LEAGUE.indexOf(a); return LEAGUE.slice(i, LEAGUE.indexOf(b, i)); };
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(PLAYERS_JS.replace(/var (PCMT_SITE_\w+)/g, 'window.$1'), ctx);
vm.runInContext('var PLAYERS = window.PCMT_SITE_PLAYERS, BY_ID = {}; PLAYERS.forEach(function (p) { BY_ID[p.id] = p; });' +
  LEAGUE.match(/var SCORING = \{[\s\S]*?\};/)[0] + LEAGUE.match(/var MULTI_FROM = [^;]*;/)[0] +
  'var DAY = 86400000;' + between('  var THU_FROM', '  // When a gameweek') +   // weekStart, the same as vp_week_start
  between('  var SUBS_FROM', '  window.PCMT_SUBS = [];') + between('  function seriesPoints', '\n  // A deck counts') +
  'this.applySubs = applySubs; this.seriesPoints = seriesPoints;', ctx);
const players = ctx.window.PCMT_SITE_PLAYERS;
const sorted = x => Array.isArray(x) ? x.map(sorted) : x && typeof x === 'object' ? Object.keys(x).sort().reduce((o, k) => (o[k] = sorted(x[k]), o), {}) : x;
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const dbApply = (r, rows) => JSON.parse(sql(`select public.vp_apply_subs(${lit(JSON.stringify(r))}::jsonb, ${lit(JSON.stringify(rows))}::jsonb, ${lit(JSON.stringify(players))}::jsonb);`));
const BYID = Object.fromEntries(players.map(p => [p.id, p]));   // vp_compute hands the scorer players keyed by id
const dbPoints = r => JSON.parse(sql(`select public.vp_series_points(${lit(JSON.stringify(r))}::jsonb, ${lit(JSON.stringify(BYID))}::jsonb);`));
const siteApply = (r, rows) => { const c = JSON.parse(JSON.stringify(r)); ctx.applySubs(rows, [c]); return c; };

// Real results from data.js (NOOT vs SEAL, Nov 1: nana played for SEAL with Dovie out)
const dctx = {}; vm.runInNewContext(fs.readFileSync(__dirname + '/../data.js', 'utf8') + ';this.R = PCMT_RESULTS;', dctx);
const WK = '2026-10-29T09:00:00+00:00';   // the gameweek Oct 29 - Nov 5
const ROWS = [{ sub: 'nana', player: 'dovie', week: WK }];
let agree = 0;
dctx.R.forEach(r => { if (same(siteApply(r, ROWS), dbApply(r, ROWS))) agree++; });
check(agree === dctx.R.length, `site and database apply subs the same way on every data.js result (${agree}/${dctx.R.length})`);
const seal = dctx.R.find(r => r.a === 'NOOT' && r.b === 'SEAL');
if (seal) {
  const site = siteApply(seal, ROWS), db = dbApply(seal, ROWS);
  check(site.stats.dovie && !site.stats['~nana'] && site.subs.dovie === 'nana' && site.maps.every(m => !('~nana' in m.k)), 'NOOT vs SEAL: nana\'s stats and map kills now count as Dovie\'s');
  const sp = ctx.seriesPoints(site), dp = dbPoints(db);
  check(sp.dovie > 0 && same(Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, +v])), Object.fromEntries(Object.entries(dp).map(([k, v]) => [k, +v]))),
    `NOOT vs SEAL: site and payout give Dovie the same points (${sp.dovie} / ${dp.dovie}) and everyone else too`);
  check(ctx.seriesPoints(seal).dovie === undefined, 'without the sub, Dovie scores nothing in that series');
}

// Cases where a sub must not count
const base = { region: 'EMEA', start: '2026-11-02T19:00:00Z', a: 'NOOT', b: 'SEAL', winner: 'SEAL', stats: { '~nana': [10, 5, 3, 1, 200, 70, 120, 1.1], eva: [8, 6, 2, 0, 180, 68, 110, 1] }, maps: [{ map: 'Ascent', a: 5, b: 13, k: { '~nana': 10, eva: 8 } }] };
const cases = [
  ['before Nov 1 2026', Object.assign({}, base, { start: '2026-10-31T19:00:00Z' }), ROWS],
  ['the player also played that series', Object.assign({}, base, { stats: Object.assign({ dovie: [1, 1, 1, 1, 100, 50, 50, 0.5] }, base.stats) }), ROWS],
  ['the player\'s team isn\'t in the series', Object.assign({}, base, { a: 'NIP', b: 'XTC' }), ROWS],
  ['the sub didn\'t play', base, [{ sub: 'someoneelse', player: 'dovie', week: WK }]],
  ['the player isn\'t on the site', base, [{ sub: 'nana', player: 'nobody', week: WK }]],
  ['the series is in the next gameweek (subs don\'t carry over)', Object.assign({}, base, { start: '2026-11-07T19:00:00Z' }), ROWS],
  ['the series is in an earlier gameweek', base, [{ sub: 'nana', player: 'dovie', week: '2026-11-05T09:00:00+00:00' }]],
  ['the sub has no gameweek', base, [{ sub: 'nana', player: 'dovie' }]]
];
cases.forEach(([why, r, rows]) => {
  const s = siteApply(r, rows), d = dbApply(r, rows);
  check(same(s, r) && same(d, r), 'no change when ' + why);
});
const two = Object.assign({}, base, { stats: Object.assign({ '~kev': [3, 3, 3, 0, 150, 60, 90, 0.9] }, base.stats), maps: [{ map: 'Ascent', a: 5, b: 13, k: { '~nana': 10, '~kev': 3, eva: 8 } }] });
const rows2 = [{ sub: 'nana', player: 'dovie', week: WK }, { sub: 'kev', player: 'otaka', week: WK }, { sub: 'nana', player: 'becosh', week: WK }];
const s2 = siteApply(two, rows2), d2 = dbApply(two, rows2);
check(same(s2, d2) && s2.subs.dovie === 'nana' && s2.subs.otaka === 'kev' && !s2.subs.becosh, 'two subs in one series both count; a sub counts for the first player listed for them only');
const nextWk = Object.assign({}, base, { start: '2026-11-07T19:00:00Z' }), rowsNext = ROWS.concat([{ sub: 'nana', player: 'dovie', week: '2026-11-05T09:00:00+00:00' }]);
check(same(siteApply(nextWk, rowsNext), dbApply(nextWk, rowsNext)) && siteApply(nextWk, rowsNext).subs.dovie === 'nana', 'entered again for the next gameweek, it counts there too');

// ---- the payout uses them ----
const realData = fs.readFileSync(__dirname + '/../data.js', 'utf8');
const withSub = sql(`select public.vp_ingest(${lit(realData)}, ${lit(PLAYERS_JS)}, now(), false);`);
sql(`delete from public.player_subs;`);
const without = sql(`select public.vp_ingest(${lit(realData)}, ${lit(PLAYERS_JS)}, now(), false);`);
check(withSub.trim().length > 2 && without.trim().length > 2, 'vp_ingest runs with and without subs');

console.log(bad ? bad + ' check(s) failed' : 'All sub checks passed');
process.exit(bad ? 1 : 0);
