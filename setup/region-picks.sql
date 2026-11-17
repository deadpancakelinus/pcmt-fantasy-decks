-- One-time region switch (Nov 17 2026). Paste into the Supabase SQL editor.
-- One row per player, written once from The Deck's switch window: region = the region their account keeps to,
-- from_region = the region their deck had, switched = whether they took the switch. Players read and add only their
-- own row and can't change or remove it. To give someone the offer again: delete from public.region_picks where user_id = '<id>';
create table if not exists public.region_picks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  region text not null check (region in ('NA', 'EMEA')),
  from_region text not null check (from_region in ('NA', 'EMEA')),
  switched boolean not null,
  created_at timestamptz not null default now(),
  check (switched = (region <> from_region))
);
alter table public.region_picks enable row level security;
drop policy if exists "read own region pick" on public.region_picks;
create policy "read own region pick" on public.region_picks for select using (auth.uid() = user_id);
drop policy if exists "add own region pick" on public.region_picks;
create policy "add own region pick" on public.region_picks for insert with check (auth.uid() = user_id);
grant select, insert on public.region_picks to authenticated;
