// Checks the Freshbatch backend's database rules (setup/backend-setup.sql) in a throwaway Postgres database:
// staff-only price changes and card counts, 4Ks/5Ks for staff, and that a deck is checked against the prices
// from when it was saved (the VP payout and league.js must agree).
//   node tools/backend-test.js <psql command, e.g. "psql -h /tmp/pg -p 5499 -U postgres"> <built players.js>
const fs = require('fs'), vm = require('vm'), { execFileSync } = require('child_process');
const PSQL = process.argv[2].split(' '), PLAYERS_JS = fs.readFileSync(process.argv[3], 'utf8');
const sql = (q, db = 'fbtest') => execFileSync(PSQL[0], PSQL.slice(1).concat(['-d', db, '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1']), { input: q, encoding: 'utf8', maxBuffer: 1 << 28 });
let bad = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) bad++; };
const fails = (q, re) => { try { sql(q); return false; } catch (e) { return re ? re.test(String(e.stderr || e.message)) : true; } };
const as = (uid, q) => `set role authenticated; set test.uid = '${uid}'; ${q}`;
const STAFF = '00000000-0000-0000-0000-0000000000f1', ADMIN = '00000000-0000-0000-0000-00000000000a', P1 = '00000000-0000-0000-0000-000000000001', P2 = '00000000-0000-0000-0000-000000000002';

sql('drop database if exists fbtest;', 'postgres'); sql('create database fbtest;', 'postgres');
sql(`create schema auth; create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;`);
sql(fs.readFileSync(__dirname + '/../setup/supabase-setup.sql', 'utf8'));
const vp = fs.readFileSync(__dirname + '/../setup/vp-setup.sql', 'utf8'); sql(vp.slice(0, vp.indexOf('-- [supabase-only]')));
sql(fs.readFileSync(__dirname + '/../setup/cards-setup.sql', 'utf8'));
const be = fs.readFileSync(__dirname + '/../setup/backend-setup.sql', 'utf8'); sql(be); sql(be); // safe to run twice
sql(`insert into auth.users (id) values ('${STAFF}'), ('${ADMIN}'), ('${P1}'), ('${P2}');
insert into public.freshbatch_staff (user_id) values ('${STAFF}'); insert into public.pcmt_admins values ('${ADMIN}');
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;   -- as on Supabase: auth.uid() works for everyone
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on public.player_price_changes, public.multikills, public.freshbatch_staff to authenticated;
grant usage on all sequences in schema public to authenticated;`);

// ---- who is staff ----
check(sql(as(STAFF, 'select public.is_freshbatch();')).trim() === 't' && sql(as(P1, 'select public.is_freshbatch();')).trim() === 'f', 'is_freshbatch() is true only for staff');
check(fails(as(P1, `insert into public.freshbatch_staff (user_id) values ('${P1}');`)), 'players cannot add themselves to the staff list');

// ---- price changes ----
check(fails(as(P1, `insert into public.player_price_changes (player, price) values ('claps', 1);`)), 'players cannot change prices');
check(fails(as(ADMIN, `insert into public.player_price_changes (player, price) values ('claps', 1);`)), 'site admins who are not staff cannot change prices');
sql(as(STAFF, `insert into public.player_price_changes (player, price, changed_at, changed_by) values ('claps', 12.5, '2020-01-01', '${P1}');`));
const row = sql(`select price || '|' || changed_by || '|' || (changed_at > now() - interval '1 minute') from public.player_price_changes where player = 'claps';`).trim();
check(row === `12.5|${STAFF}|true`, 'staff can change a price; the time and who changed it are set by the server (' + row + ')');
check(fails(as(STAFF, `insert into public.player_price_changes (player, price) values ('claps', 31);`)) && fails(as(STAFF, `insert into public.player_price_changes (player, price) values ('claps', 7.3);`))
  && fails(as(STAFF, `insert into public.player_price_changes (player, price) values ('claps', -1);`)), 'prices must be 0 to 30 in steps of 0.5');
sql(as(STAFF, `update public.player_price_changes set price = 1; delete from public.player_price_changes;`));
check(sql(`select count(*) || '|' || max(price) from public.player_price_changes;`).trim() === '1|12.5', 'nobody can rewrite or delete the price history from the site');
check(sql(`set role anon; select count(*) from public.player_price_changes;`).trim() === '1', 'anyone can read prices (the site needs them)');

// ---- cards sheet ----
sql(`insert into public.user_cards (user_id, card_id, count) values ('${P1}', 'c:claps', 3), ('${P2}', 'c:claps', 1), ('${P2}', 'v:teklo-variant', 1);`);
check(fails(as(P1, 'select * from public.fb_card_counts();'), /staff only/) && fails('set role anon; select * from public.fb_card_counts();'), 'only staff can see card counts');
const counts = sql(as(STAFF, `select card_id || ':' || copies || ':' || owners from public.fb_card_counts() order by 1;`)).trim().split('\n');
check(counts.join(',') === 'c:claps:4:2,v:teklo-variant:1:1', 'card counts add up copies and owners (' + counts.join(', ') + ')');

// ---- 4Ks and 5Ks ----
sql(as(STAFF, `insert into public.multikills (series, player, k4, k5) values ('2026-10-24T00:00:00Z|T1|NAVI', 'crocman', 1, 0);`));
sql(as(ADMIN, `insert into public.multikills (series, player, k4, k5) values ('2026-10-24T00:00:00Z|T1|NAVI', 'pi', 0, 1);`));
check(sql('select count(*) from public.multikills;').trim() === '2', 'staff and admins can enter 4Ks and 5Ks');
check(fails(as(P1, `insert into public.multikills (series, player, k4, k5) values ('x', 'roro', 1, 0);`)), 'players cannot enter 4Ks and 5Ks');

// ---- budget with the prices from when a deck was saved ----
const ctx = { window: {} };
vm.runInNewContext(PLAYERS_JS.replace(/var (PCMT_SITE_\w+)/g, 'window.$1'), ctx);
const P = ctx.window.PCMT_SITE_PLAYERS, TW = ctx.window.PCMT_SITE_TWIN || {};
const LEAGUE = fs.readFileSync(__dirname + '/league.js', 'utf8');
const core = LEAGUE.slice(LEAGUE.indexOf('  function weekStart(t)'), LEAGUE.indexOf('  // ---------- Supabase over plain fetch'));
vm.runInNewContext('var DAY = 86400000, BUDGET = 100, TEAM_LIMIT = 2, TRANSFERS = 2, LOCK_LEAD_H = 12, ROLES = ["duelist","controller","initiator","sentinel"],' +
  ' SCORING = {}, MULTI_FROM = 0;\n' + core + '\nthis.api = { validDeck: validDeck, setLog: function (l) { PRICE_LOG = l; } };', ctx);
// a valid deck close to the budget
const role = p => { const r = p.role.split('/')[0]; return r === 'yoru' ? 'duelist' : r; };
let slots = null, cost = 0;
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let tries = 0; tries < 20000; tries++) {   // random valid decks; keep the one closest to the budget
  const s = {}, used = new Set(), teams = {}; let c = 0, ok = true;
  const keys = ['duelist-1', 'duelist-2', 'controller-1', 'controller-2', 'initiator-1', 'initiator-2', 'sentinel-1', 'sentinel-2', 'wild-1', 'wild-2', 'wild-3'];
  for (const k of keys) {
    const r = k.split('-')[0], pool = P.filter(q => !used.has(q.id) && !(TW[q.id] && used.has(TW[q.id])) && (teams[q.team] || 0) < 2 && (r === 'wild' || role(q) === r));
    if (!pool.length) { ok = false; break; }
    const q = pool[Math.floor(rnd() * pool.length)]; s[k] = q.id; used.add(q.id); teams[q.team] = (teams[q.team] || 0) + 1; c += q.price;
  }
  if (ok && c <= 100 && c > cost && ctx.api.validDeck(s, 0)) { slots = s; cost = c; }
}
const cheapest = Object.values(slots).map(id => P.find(p => p.id === id)).sort((a, b) => a.price - b.price)[0];
const raised = Math.min(30, Math.ceil((cheapest.price + (100.5 - cost)) * 2) / 2);
check(ctx.api.validDeck(slots, Date.parse('2026-10-20T12:00:00Z')), 'test deck is within budget at players.js prices (' + cost + ' credits)');
const tSave1 = '2026-10-20T12:00:00Z', tChange = '2026-10-21T12:00:00Z', tSave2 = '2026-10-22T12:00:00Z';
sql(`delete from public.player_price_changes; alter table public.player_price_changes disable trigger player_price_stamp;
insert into public.player_price_changes (player, price, changed_at, changed_by) values ('${cheapest.id}', ${raised}, '${tChange}', '${STAFF}');
alter table public.player_price_changes enable trigger player_price_stamp;
alter table public.deck_history disable trigger user;
insert into public.deck_history (user_id, name, slots, igl, created_at) values ('${P1}', 'before', '${JSON.stringify(slots)}', null, '${tSave1}'), ('${P2}', 'after', '${JSON.stringify(slots)}', null, '${tSave2}');
alter table public.deck_history enable trigger user;`);
ctx.api.setLog([{ player: cheapest.id, price: raised, t: Date.parse(tChange) }]);
const siteBefore = ctx.api.validDeck(slots, Date.parse(tSave1)), siteAfter = ctx.api.validDeck(slots, Date.parse(tSave2));
check(siteBefore && !siteAfter, `site: the deck saved before ${cheapest.id} went ${cheapest.price} -> ${raised} still counts; the same deck saved after is over budget`);
const at = t => sql(`select (public.vp_players_at((select jsonb_object_agg(p ->> 'id', p) from jsonb_array_elements('${JSON.stringify(P).replace(/'/g, "''")}'::jsonb) p), '${t}') -> '${cheapest.id}' ->> 'price');`).trim();
check(+at(tSave1) === cheapest.price && +at(tSave2) === raised, 'vp_players_at gives the price in effect at each time');
const m = [{ region: 'NA', start: '2026-10-24T00:00:00Z', a: 'T1', b: 'NAVI', bo: 5, hours: 5, url: 'x' }];
const res = JSON.parse(sql(`select public.vp_compute('${JSON.stringify(m)}', '[]', '${JSON.stringify(P).replace(/'/g, "''")}', '${JSON.stringify(TW)}', '2026-10-27T10:00:00Z', false);`).trim());
const users = new Set(res.weeks.map(w => w.user));
check(users.has(P1) && !users.has(P2), 'VP payout agrees: the deck saved before the change counts, the one saved after does not');
sql(as(STAFF, `insert into public.player_price_changes (player, price) values ('${cheapest.id}', null);`));
check(+at(new Date(Date.now() + 60000).toISOString()) === cheapest.price, 'a reset (null price) puts the player back on the players.js price');

// ---- page password ----
check(sql(`set role anon; select coalesce(public.fb_page_unlock('anything')::text, 'none');`).trim() === 'none', 'no page password set yet: the page says so');
check(fails(`set role anon; select public.fb_set_page_password('hunter2hunter2');`) && fails(as(STAFF, `select public.fb_set_page_password('hunter2hunter2');`)), 'nobody can set the page password from the site');
check(fails(`select public.fb_set_page_password('short');`, /8 characters/), 'the page password needs at least 8 characters');
sql(`select public.fb_set_page_password('fresh batch 2026');`);
check(sql(`set role anon; select public.fb_page_unlock('fresh batch 2026');`).trim() === 't' && sql(`set role anon; select public.fb_page_unlock('wrong one');`).trim() === 'f', 'the right page password unlocks, a wrong one does not');
check(!/fresh batch 2026/.test(sql(`select value from public.freshbatch_settings;`)) && fails(`set role anon; select * from public.freshbatch_settings;`) === false && sql(`set role anon; select count(*) from public.freshbatch_settings;`).trim() === '0', 'only a hash is stored, and the site cannot read it');

sql('drop database fbtest;', 'postgres');
console.log(bad ? bad + ' problem(s)' : 'All backend checks passed');
process.exit(bad ? 1 : 0);
