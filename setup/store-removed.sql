-- PCMT Fantasy Decks: the Remove / Put back buttons for The Deck's store (backend.html, Player prices tab).
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once.
-- (Also in setup/backend-setup.sql.)

-- ===================== Players taken out of The Deck's store =====================
-- A row here hides that player from The Deck's store and random deals. Managers who already have the player keep them.
-- Staff add and remove rows from the backend (Player prices tab: Remove / Put back).
create table if not exists public.store_removed_players (
  player text primary key,                  -- player id from players.js
  removed_at timestamptz not null default now(),
  removed_by uuid references auth.users (id) on delete set null
);
alter table public.store_removed_players enable row level security;
drop policy if exists "anyone reads removed players" on public.store_removed_players;
create policy "anyone reads removed players" on public.store_removed_players for select using (true);
drop policy if exists "staff remove players" on public.store_removed_players;
create policy "staff remove players" on public.store_removed_players for insert with check ((select public.is_freshbatch()));
drop policy if exists "staff put players back" on public.store_removed_players;
create policy "staff put players back" on public.store_removed_players for delete using ((select public.is_freshbatch()));
create or replace function public.store_removed_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  new.removed_at := now();
  new.removed_by := auth.uid();
  return new;
end $$;
drop trigger if exists store_removed_stamp on public.store_removed_players;
create trigger store_removed_stamp before insert on public.store_removed_players
  for each row execute function public.store_removed_stamp();
grant select on public.store_removed_players to anon, authenticated;
grant insert, delete on public.store_removed_players to authenticated;

-- Check: should say 0 (nobody removed yet).
select count(*) as removed_players from public.store_removed_players;
