// Checks setup/deck-swaps.sql in a throwaway Postgres database: only staff can swap, a swap changes the saved deck
// (or saves a copy as a new deck), the IGL follows the player going out, and every swap is logged.
//   node tools/deck-swaps-test.js <psql command, e.g. "psql -h /tmp/pg -p 5499 -U postgres">
const fs = require('fs'), { execFileSync } = require('child_process');
const PSQL = process.argv[2].split(' ');
const sql = (q, db = 'dstest') => execFileSync(PSQL[0], PSQL.slice(1).concat(['-d', db, '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1']), { input: q, encoding: 'utf8' });
let bad = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) bad++; };
const fails = (q, re) => { try { sql(q); return false; } catch (e) { return re ? re.test(String(e.stderr || e.message)) : true; } };
const as = (uid, q) => `set role authenticated; set test.uid = '${uid}'; ${q}`;
const STAFF = '00000000-0000-0000-0000-0000000000f1', P1 = '00000000-0000-0000-0000-000000000001';

sql('drop database if exists dstest;', 'postgres'); sql('create database dstest;', 'postgres');
sql(`create schema auth; create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;`);
sql(fs.readFileSync(__dirname + '/../setup/supabase-setup.sql', 'utf8'));
sql(`alter table public.deck_history add column if not exists region text;
create table if not exists public.freshbatch_staff (user_id uuid primary key);
create or replace function public.is_freshbatch() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.freshbatch_staff where user_id = auth.uid()) $$;`);
const ds = fs.readFileSync(__dirname + '/../setup/deck-swaps.sql', 'utf8'); sql(ds); sql(ds); // safe to run twice
sql(`insert into auth.users (id) values ('${STAFF}'), ('${P1}');
insert into public.freshbatch_staff values ('${STAFF}');
grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
insert into public.deck_history (user_id, name, slots, igl, region) values ('${P1}', 'Mine', '{"duelist-1":"colt-s4","duelist-2":"corina-s4","wild-1":"nut-s4"}', 'colt-s4', 'NA');
update public.deck_history set created_at = '2026-11-01T00:00:00Z';`);
const deck = () => sql(`select slots ->> 'duelist-1', igl, created_at = '2026-11-01T00:00:00Z' from public.deck_history where id = 1;`).trim();

check(fails(as(P1, `select public.fb_deck_swap(1, 'duelist-1', 'angus-s4');`), /Staff only/), 'players cannot swap');
check(fails(as(STAFF, `select public.fb_deck_swap(1, 'duelist-1', 'corina-s4');`), /already in this deck/), 'cannot put in a player already in the deck');
check(fails(as(STAFF, `select public.fb_deck_swap(1, 'controller-1', 'angus-s4');`), /no controller-1 slot/), 'cannot swap a slot the deck does not have');
check(sql(as(STAFF, `select public.fb_deck_swap(1, 'duelist-1', 'angus-s4');`)).trim() === '1', 'a swap changes the saved deck itself');
check(deck() === 'angus-s4|angus-s4|t', 'the new player is in, takes the IGL, and the save time stays');
const id = sql(as(STAFF, `select public.fb_deck_swap(1, 'wild-1', 'linus-s4', true);`)).trim();
check(id === '2' && sql(`select slots ->> 'wild-1', slots ->> 'duelist-1', igl, user_id, region, created_at > now() - interval '1 minute' from public.deck_history where id = 2;`).trim() === `linus-s4|angus-s4|angus-s4|${P1}|NA|t`,
  'as a new deck: a copy for that user, saved now');
check(sql(`select slots ->> 'wild-1' from public.deck_history where id = 1;`).trim() === 'nut-s4', 'as a new deck: the old deck is left alone');
check(sql(`select string_agg(player_out || '>' || player_in || ':' || as_new || ':' || created_by, ',' order by id) from public.deck_swaps;`).trim() === `colt-s4>angus-s4:false:${STAFF},nut-s4>linus-s4:true:${STAFF}`, 'every swap is logged with who did it');
check(sql(as(P1, `select count(*) from public.deck_swaps;`)).trim() === '0' && sql(as(STAFF, `select count(*) from public.deck_swaps;`)).trim() === '2', 'only staff can read the swap log');

sql('drop database dstest;', 'postgres');
console.log(bad ? bad + ' failed' : 'all deck swap checks passed');
process.exit(bad ? 1 : 0);
