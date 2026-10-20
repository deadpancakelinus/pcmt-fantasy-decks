// Checks setup/cards-setup.sql (buying packs) in a throwaway Postgres database.
//   node tools/cards-test.js <psql command, e.g. "psql -h /tmp/pg -p 5499 -U postgres">
const fs = require('fs'), { execFileSync, spawn } = require('child_process');
const PSQL = process.argv[2].split(' ');
const sql = (q, db = 'cardtest') => execFileSync(PSQL[0], PSQL.slice(1).concat(['-d', db, '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1']), { input: q, encoding: 'utf8', maxBuffer: 1 << 28 });
const sqlAsync = (q) => new Promise(res => { const p = spawn(PSQL[0], PSQL.slice(1).concat(['-d', 'cardtest', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'])); let out = '', err = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d); p.on('close', code => res({ code, out, err })); p.stdin.end(q); });
let bad = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) bad++; };
const fails = (q, re) => { try { sql(q); return false; } catch (e) { return re ? re.test(String(e.stderr || e.message)) : true; } };
const as = (uid, q) => `set role authenticated; set test.uid = '${uid}'; ${q}`;
const ADMIN = '00000000-0000-0000-0000-00000000000a', P1 = '00000000-0000-0000-0000-000000000001', P2 = '00000000-0000-0000-0000-000000000002';

sql('drop database if exists cardtest;', 'postgres'); sql('create database cardtest;', 'postgres');
sql(`create schema auth; create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;`);
sql(fs.readFileSync(__dirname + '/../setup/supabase-setup.sql', 'utf8'));
const vp = fs.readFileSync(__dirname + '/../setup/vp-setup.sql', 'utf8'); sql(vp.slice(0, vp.indexOf('-- [supabase-only]')));
const cards = fs.readFileSync(__dirname + '/../setup/cards-setup.sql', 'utf8'); sql(cards); sql(cards); // safe to run twice
sql(`insert into auth.users (id) values ('${ADMIN}'), ('${P1}'), ('${P2}'); insert into public.pcmt_admins values ('${ADMIN}');
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on public.user_cards, public.card_packs, public.pack_openings, public.vp_ledger to authenticated;
grant usage on all sequences in schema public to authenticated;`);
const buy = (uid, pack = 'na-pack') => JSON.parse(sql(as(uid, `select public.buy_pack('${pack}');`)).trim());
const bal = uid => +sql(`select coalesce(sum(amount),0) from public.vp_ledger where user_id = '${uid}';`).trim();

check(+sql(`select count(*) from public.cards where active;`).trim() === 144, 'catalog has 131 commons + 13 variants (2 + 11 champions)');
check(sql(`select rarity from public.cards where id = 'v:teklo-variant';`).trim() === 'rare', 'The Role of Yoru is Rare');
check(fails(`set role anon; select public.buy_pack('na-pack');`), 'logged-out visitors cannot buy');
check(fails(as(P1, `select public.buy_pack('na-pack');`), /aren't on sale yet/), 'before launch, a player who is not an admin cannot buy');
check(sql(`select string_agg(price::text, ',') from public.card_packs`).trim() === '0,0', 'new packs start at 0 VP'); sql(`update public.card_packs set price = null`); check(fails(as(ADMIN, `select public.buy_pack('na-pack');`), /doesn't have a price/), 'a pack with no price cannot be bought');
check(fails(as(P1, `update public.card_packs set price = 0;`)) || sql(`select string_agg(coalesce(price::text,'null'), ',') from public.card_packs`).trim() === 'null,null', 'a player cannot set the price');
sql(as(ADMIN, `update public.card_packs set price = 0;`));
check(sql(`select string_agg(price::text, ',') from public.card_packs`).trim() === '0,0', 'an admin can set the price');
let r = buy(ADMIN);
check(r.cards.length === 5 && r.cards.every(c => c.id && c.player && c.rarity), 'a pack gives 5 cards');
check(bal(ADMIN) === 0 && +sql(`select count(*) from public.vp_ledger where user_id = '${ADMIN}'`).trim() === 0, 'a free pack takes no VP and writes no ledger line');

// odds: 70 common / 22 rare / 7 epic / 1 legendary, with no epic/legendary cards they drop to rare
const N = 1200; const tally = { common: 0, rare: 0, epic: 0, legendary: 0 };
const many = sql(as(ADMIN, `select string_agg((c ->> 'rarity') || ':' || (c ->> 'region'), ',') from generate_series(1, ${N}) g, lateral jsonb_array_elements(public.buy_pack('na-pack' || left(g::text, 0)) -> 'cards') c;`)).trim().split(',');
check(many.every(x => x.endsWith(':NA')), 'the NA pack only gives NA players');
many.forEach(x => tally[x.split(':')[0]]++);
const share = k => tally[k] / many.length;
check(many.length === N * 5, `${N} packs gave ${N * 5} cards`);
check(Math.abs(share('common') - 0.70) < 0.025 && Math.abs(share('rare') - 0.30) < 0.025 && !tally.epic && !tally.legendary,
  `odds hold: common ${(share('common') * 100).toFixed(1)}%, rare ${(share('rare') * 100).toFixed(1)}% (22% + epic/legendary dropping down), epic 0, legendary 0`);
const owned = +sql(`select sum(count) from public.user_cards where user_id = '${ADMIN}';`).trim();
check(owned === (N + 1) * 5, 'duplicates are kept as a count (' + owned + ' cards owned)');
check(+sql(`select count from public.user_cards where user_id = '${ADMIN}' and card_id = 'v:teklo-variant';`).trim() > 20, 'the The Role of Yoru gets pulled');
check(+sql(`select count(*) from public.pack_openings where user_id = '${ADMIN}';`).trim() === N + 1, 'every opening is logged');
const pos = sql(`select string_agg(p::text, ',') from public.pack_openings o, lateral jsonb_array_elements(o.cards) with ordinality c(x, p) where o.user_id = '${ADMIN}' and c.x ->> 'rarity' = 'rare';`).trim().split(',').map(Number);
const at = [1, 2, 3, 4, 5].map(k => pos.filter(x => x === k).length / pos.length);
check(at.every(f => f > 0.15 && f < 0.25), 'rares land anywhere in the pack: ' + at.map(f => (f * 100).toFixed(0) + '%').join(' / ') + ' at positions 1-5');
const eu = sql(as(ADMIN, `select string_agg((c ->> 'rarity') || ':' || (c ->> 'region'), ',') from generate_series(1, 200) g, lateral jsonb_array_elements(public.buy_pack('emea-pack' || left(g::text, 0)) -> 'cards') c;`)).trim().split(',');
check(eu.length === 1000 && eu.every(x => x.endsWith(':EMEA')) && eu.some(x => x === 'rare:EMEA'), 'the EMEA pack only gives EMEA players, and its champions come out as Rares');

// paying with VP
sql(`update public.card_packs set price = 100, open_to_all = true; insert into public.vp_ledger (user_id, kind, week, amount) values ('${P1}', 'week', '2026-10-19', 250);`);
r = buy(P1); check(r.balance === 150 && bal(P1) === 150, 'buying a 100 VP pack takes 100 VP from the Bank');
check(sql(`select detail ->> 'pack' from public.vp_ledger where user_id = '${P1}' and kind = 'pack' limit 1;`).trim() === 'NA Card Pack', 'the Spending line names the pack');
buy(P1);
check(fails(as(P1, `select public.buy_pack('na-pack');`), /Not enough VP: this pack costs 100 VP and you have 50/), 'not enough VP: refused with a clear message, nothing taken');
check(bal(P1) === 50 && +sql(`select coalesce(sum(count),0) from public.user_cards where user_id = '${P1}'`).trim() === 10, 'Bank and cards stay right after the refusal');

// two purchases at the same moment with VP for only one
sql(`insert into public.vp_ledger (user_id, kind, week, amount) values ('${P2}', 'week', '2026-10-19', 150);`);
(async () => {
  const both = await Promise.all([sqlAsync(as(P2, `select public.buy_pack('na-pack'); select pg_sleep(0.3);`)), sqlAsync(as(P2, `select public.buy_pack('na-pack');`))]);
  check(both.filter(x => x.code === 0).length === 1 && bal(P2) === 50, 'two purchases at once with VP for one: only one goes through (balance ' + bal(P2) + ')');
  // privacy
  check(sql(as(P1, `select count(distinct user_id) from public.user_cards;`)).trim() === '1', 'players only see their own cards');
  check(fails(as(P1, `insert into public.user_cards (user_id, card_id) values ('${P1}', 'v:teklo-variant');`)), 'players cannot give themselves cards');
  check(fails(as(P1, `insert into public.vp_ledger (user_id, kind, amount) values ('${P1}', 'week', 999);`)), 'players cannot give themselves VP');
  check(fails(as(P1, `update public.card_packs set price = 1;`)) || sql(`select string_agg(price::text, ',') from public.card_packs`).trim() === '100,100', 'players cannot change the price');
  check(sql(`set role anon; select count(*) from public.card_packs;`).trim() === '2' && sql(`set role anon; select count(*) from public.cards;`).trim() === '144', 'anyone can see the packs and the catalog');
  sql('drop database cardtest;', 'postgres');
  console.log(bad ? bad + ' problem(s)' : 'All card pack checks passed');
  process.exit(bad ? 1 : 0);
})();
