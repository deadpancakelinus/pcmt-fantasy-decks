-- PCMT Fantasy Decks: database setup.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once.

-- 1) Managers (one row per Discord account that signs in)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default 'Manager',
  avatar_url text,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles readable by everyone" on public.profiles;
create policy "profiles readable by everyone" on public.profiles for select using (true);
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- 2) Deck submissions. Every "Lock in deck" adds a row; rows can never be edited or deleted.
--    The time is always set by the server, so nobody can back-date a deck past a lock.
create table if not exists public.deck_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null default '',
  slots jsonb not null,
  igl text,
  created_at timestamptz not null default now()
);
create index if not exists deck_history_user_time on public.deck_history (user_id, created_at);
alter table public.deck_history enable row level security;
drop policy if exists "decks readable by everyone" on public.deck_history;
create policy "decks readable by everyone" on public.deck_history for select using (true);
drop policy if exists "insert own deck" on public.deck_history;
create policy "insert own deck" on public.deck_history for insert with check (auth.uid() = user_id);

create or replace function public.deck_history_stamp() returns trigger
language plpgsql as $$
begin
  new.created_at := now();
  if jsonb_typeof(new.slots) <> 'object' then raise exception 'bad deck'; end if;
  new.name := left(coalesce(new.name, ''), 32);
  return new;
end $$;
drop trigger if exists deck_history_stamp on public.deck_history;
create trigger deck_history_stamp before insert on public.deck_history
  for each row execute function public.deck_history_stamp();

-- Limit how fast one account can submit (stops spam): at most 60 submissions per hour.
create or replace function public.deck_history_rate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.deck_history
      where user_id = new.user_id and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Too many deck saves. Try again in a little while.';
  end if;
  return new;
end $$;
drop trigger if exists deck_history_rate on public.deck_history;
create trigger deck_history_rate before insert on public.deck_history
  for each row execute function public.deck_history_rate();

-- 3) Unlock codes. The codes table is private: players can only redeem through redeem_code().
create table if not exists public.codes (
  code text primary key,
  unlocks text[] not null
);
alter table public.codes enable row level security; -- no policies = nobody can read it from the website

create table if not exists public.user_unlocks (
  user_id uuid not null references auth.users (id) on delete cascade,
  unlock text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, unlock)
);
alter table public.user_unlocks enable row level security;
drop policy if exists "read own unlocks" on public.user_unlocks;
create policy "read own unlocks" on public.user_unlocks for select using (auth.uid() = user_id);

create or replace function public.redeem_code(p_code text) returns text[]
language plpgsql security definer set search_path = public as $$
declare u text[];
begin
  if auth.uid() is null then raise exception 'Log in with Discord to redeem codes.'; end if;
  select unlocks into u from public.codes where code = upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  if u is null then raise exception 'That code isn''t valid. Check it and try again.'; end if;
  insert into public.user_unlocks (user_id, unlock)
    select auth.uid(), x from unnest(u) as x
    on conflict do nothing;
  return u;
end $$;
revoke all on function public.redeem_code(text) from public;
grant execute on function public.redeem_code(text) to authenticated;

-- Codes. Add more with: insert into public.codes values ('NEWCODE', array['GOLD']);
-- Unlock keys: PRIDE, GOLD, TROPHY, ETHAN, HALO, MISSED, TEAMS (all team decks), a team code like 'T1', or ALL.
insert into public.codes (code, unlocks) values ('PRIDE', array['PRIDE'])
  on conflict (code) do update set unlocks = excluded.unlocks;
