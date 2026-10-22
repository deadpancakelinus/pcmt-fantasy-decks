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

-- Deck names: words that aren't allowed (same rules as pcmtCensorName in league.js and The Deck).
-- Look-alike characters count (0=o, 1=i, 3=e, 4=a, 5=s, $=s, @=a ...) and spaces or dots between letters don't hide a word.
-- "ass" and "pee" only count as whole words or a few compounds, so class, pass, speed and assassin are fine.
create or replace function public.pcmt_bad_name(p_name text) returns boolean
language sql immutable as $$
  with n as (select translate(lower(coalesce(p_name, '')), '01!|34@5$78', 'oiiieaasstb') as t)
  select regexp_replace(t, '[^a-z]', '', 'g') ~ 'f+u+c+k+|s+h+i+t+(?!ake)|p+o{2,}p+|p+i+s{2,}|f+a+g{2,}|i+s+r+a+e+l+'
      or regexp_replace(t, '[^a-z]', '', 'g') ~ '^(a+s{2,}|p+e{2,})$'
      or exists (select 1 from regexp_split_to_table(regexp_replace(t, '[^a-z]+', ' ', 'g'), ' ') w
                 where w ~ '^a+s{2,}(e?s|holes?|hats?|wipes?|clowns?|face)?$'
                    or w ~ '^(dumb|bad|jack|smart|fat|kick|lame|big|half|hard|wise|dick|stupid)a+s{2,}(e?s)?$'
                    or w ~ '^p+e{2,}(s|d|ing|pee)?$')
  from n
$$;

create or replace function public.deck_history_stamp() returns trigger
language plpgsql as $$
begin
  new.created_at := now();
  if jsonb_typeof(new.slots) <> 'object' then raise exception 'bad deck'; end if;
  new.name := left(coalesce(new.name, ''), 32);
  if public.pcmt_bad_name(new.name) then raise exception 'That deck name isn''t allowed. Pick another one.'; end if;
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

create or replace function public.profiles_real_name() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare md jsonb; cand text; pick text;
begin
  select raw_user_meta_data into md from auth.users where id = new.id;
  -- Discord display name first, then the Discord username. A name with no letters or
  -- numbers (like "...") is skipped so the leaderboard always shows something readable.
  foreach cand in array array[md -> 'custom_claims' ->> 'global_name', md ->> 'full_name',
                               md ->> 'name', md ->> 'user_name', md ->> 'preferred_username'] loop
    cand := btrim(regexp_replace(coalesce(cand, ''), '#0$', ''));
    if cand ~ '[[:alnum:]]' then pick := cand; exit; end if;
  end loop;
  new.name := left(coalesce(pick, 'Manager'), 40);
  new.avatar_url := md ->> 'avatar_url';
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists profiles_real_name on public.profiles;
create trigger profiles_real_name before insert or update on public.profiles
  for each row execute function public.profiles_real_name();
-- Re-apply to anyone already signed up.
update public.profiles set updated_at = now();
