// Checks the launch list (setup/pages-setup.sql) in a throwaway Postgres database.
//   node tools/pages-test.js <psql command, e.g. "psql -h /tmp/pg -p 5499 -U postgres">
const fs = require('fs'), { execFileSync } = require('child_process');
const PSQL = process.argv[2].split(' ');
const sql = (q, db = 'pgtest') => execFileSync(PSQL[0], PSQL.slice(1).concat(['-d', db, '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1']), { input: q, encoding: 'utf8' });
let bad = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) bad++; };
const fails = (q, re) => { try { sql(q); return false; } catch (e) { return re ? re.test(String(e.stderr || e.message)) : true; } };
const as = (uid, q) => `set role authenticated; set test.uid = '${uid}'; ${q}`;
const STAFF = '00000000-0000-0000-0000-0000000000f1', P1 = '00000000-0000-0000-0000-000000000001';

sql('drop database if exists pgtest;', 'postgres'); sql('create database pgtest;', 'postgres');
sql(`create schema auth; create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;`);
sql(fs.readFileSync(__dirname + '/../setup/supabase-setup.sql', 'utf8'));
const vp = fs.readFileSync(__dirname + '/../setup/vp-setup.sql', 'utf8'); sql(vp.slice(0, vp.indexOf('-- [supabase-only]')));
sql(fs.readFileSync(__dirname + '/../setup/cards-setup.sql', 'utf8'));
const pg = fs.readFileSync(__dirname + '/../setup/pages-setup.sql', 'utf8'); sql(pg); sql(pg);   // safe to run twice
sql(`insert into auth.users (id) values ('${STAFF}'), ('${P1}');
insert into public.freshbatch_staff (user_id) values ('${STAFF}');
update public.card_packs set open_to_all = false;
grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on public.site_pages to anon, authenticated;`);

check(sql(`set role anon; select string_agg(id || ':' || launched, ',' order by sort) from public.site_pages;`).trim() === 'mvp-vs:false,store:false,library:false', 'everyone can read the launch list; all three start hidden');
check(fails(as(P1, `select public.fb_launch_page('store');`), /staff only/) && fails(`set role anon; select public.fb_launch_page('store');`), 'players and logged-out visitors cannot launch a page');
check(fails(as(P1, `update public.site_pages set launched = true;`)) === false && sql(`select count(*) from public.site_pages where launched;`).trim() === '0', 'players cannot launch a page by writing to the table');
check(/Library is live/.test(sql(as(STAFF, `select public.fb_launch_page('library');`))), 'staff can launch a page');
check(sql(`select launched_by from public.site_pages where id = 'library';`).trim() === STAFF && sql(`select count(*) from public.card_packs where open_to_all;`).trim() === '0', 'launching the Library records who did it and leaves packs closed');
check(/Store is live/.test(sql(as(STAFF, `select public.fb_launch_page('store');`))) && sql(`select count(*) from public.card_packs where not open_to_all;`).trim() === '0', 'launching the Store opens every card pack to everyone');
check(/already live/.test(sql(as(STAFF, `select public.fb_launch_page('store');`))), 'launching twice does nothing');
check(fails(as(STAFF, `select public.fb_launch_page('home');`), /isn't on the launch list/), 'only pages on the list can be launched');
console.log(bad ? `${bad} check(s) failed` : 'all launch-list checks passed');
process.exit(bad ? 1 : 0);
