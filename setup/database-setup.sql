-- PCMT Fantasy Decks: Database (database.html), the player database. Backend-only: only site admins and PCMT Team
-- staff can read it (RLS), and the page is on the backend's Pages list, not launched.
-- Paste into Supabase → SQL Editor → Run. Needs setup/pages-setup.sql first. Safe to run more than once.
-- The player rows live only in Supabase (added from the Nov 10 2026 sheet), not in this repo.
-- mark: 'gold' or 'red', the row colours on the sheet.
create table if not exists public.player_database (
  id int primary key,
  display text not null,
  discord text,
  riot text,
  roles text,
  rank_delta numeric,
  new_rank numeric,
  peak text,
  tracker int,
  maps int,
  games int,
  mark text check (mark in ('gold', 'red')),
  team text not null default 'NA',                -- NA until teams are drafted
  updated_at timestamptz not null default now()
);
alter table public.player_database add column if not exists team text not null default 'NA';
alter table public.player_database enable row level security;
drop policy if exists "staff read the database" on public.player_database;
create policy "staff read the database" on public.player_database for select
  using (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch());
drop policy if exists "staff edit the database" on public.player_database;
create policy "staff edit the database" on public.player_database for all
  using (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch())
  with check (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch());
revoke all on public.player_database from anon;

insert into public.site_pages (id, name, path, sort) values ('database', 'Database', 'database.html', 5)
on conflict (id) do nothing;
