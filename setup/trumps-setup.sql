-- PCMT Top Trumps (private beta): database setup.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once.
-- Nothing here touches the Fantasy Decks tables.

-- 1) Approved testers. Only people listed here can create, join or play rooms.
create table if not exists public.trumps_testers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.trumps_testers enable row level security;
-- No policies: the site cannot read or change this list. Manage it from the SQL Editor (step 4).

create or replace function public.trumps_is_tester() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trumps_testers where user_id = auth.uid());
$$;

-- 2) Rooms. Players only ever see rooms they are seated in.
create table if not exists public.trumps_rooms (
  code text primary key,
  region text not null check (region in ('na', 'emea')),
  host uuid not null references auth.users (id) on delete cascade,
  guest uuid references auth.users (id) on delete cascade,
  host_name text not null default 'Player 1',
  guest_name text,
  state jsonb not null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.trumps_rooms enable row level security;
drop policy if exists "players read their rooms" on public.trumps_rooms;
create policy "players read their rooms" on public.trumps_rooms for select
  using (public.trumps_is_tester() and auth.uid() in (host, guest));
-- No insert/update/delete policies: all writes go through the functions below.

-- 3) Room functions used by the game page.
create or replace function public.trumps_create(p_region text, p_state jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare c text; n int := 0;
begin
  if not public.trumps_is_tester() then raise exception 'Top Trumps is in a private beta.'; end if;
  if p_region not in ('na', 'emea') then raise exception 'Unknown region.'; end if;
  -- Tidy up: rooms untouched for a day are removed.
  delete from public.trumps_rooms where updated_at < now() - interval '1 day';
  if (select count(*) from public.trumps_rooms where host = auth.uid()) >= 5 then
    raise exception 'You already have 5 open rooms. Finish one first.';
  end if;
  loop
    c := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
            from generate_series(1, 5));
    exit when length(c) = 5 and not exists (select 1 from public.trumps_rooms where code = c);
    n := n + 1; if n > 20 then raise exception 'Could not make a room code, try again.'; end if;
  end loop;
  insert into public.trumps_rooms (code, region, host, host_name, state)
  values (c, p_region, auth.uid(), coalesce((select name from public.profiles where id = auth.uid()), 'Player 1'), p_state);
  return c;
end $$;

create or replace function public.trumps_join(p_code text) returns public.trumps_rooms
language plpgsql security definer set search_path = public as $$
declare r public.trumps_rooms;
begin
  if not public.trumps_is_tester() then raise exception 'Top Trumps is in a private beta.'; end if;
  select * into r from public.trumps_rooms where code = upper(trim(p_code)) for update;
  if not found then raise exception 'No room with that code.'; end if;
  if r.host = auth.uid() or r.guest = auth.uid() then return r; end if;
  if r.guest is not null then raise exception 'That room is full.'; end if;
  update public.trumps_rooms
     set guest = auth.uid(),
         guest_name = coalesce((select name from public.profiles where id = auth.uid()), 'Player 2'),
         version = version + 1, updated_at = now()
   where code = r.code
  returning * into r;
  return r;
end $$;

-- A move replaces the game state, but only if nobody else moved first (p_version must match).
create or replace function public.trumps_move(p_code text, p_version int, p_state jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.trumps_is_tester() then raise exception 'Top Trumps is in a private beta.'; end if;
  update public.trumps_rooms
     set state = p_state, version = version + 1, updated_at = now()
   where code = upper(trim(p_code)) and version = p_version and guest is not null
     and auth.uid() in (host, guest)
  returning version into v;
  if v is null then raise exception 'The game moved on. Refreshing.'; end if;
  return v;
end $$;

revoke all on function public.trumps_create(text, jsonb), public.trumps_join(text), public.trumps_move(text, int, jsonb) from public, anon;
grant execute on function public.trumps_create(text, jsonb), public.trumps_join(text), public.trumps_move(text, int, jsonb) to authenticated;
grant execute on function public.trumps_is_tester() to authenticated;

-- 4) Adding a tester (they must have logged in to fantasy.pcmt.gg with Discord at least once).
--    Change the name and run just this line:
-- insert into public.trumps_testers (user_id) select id from public.profiles where name ilike 'deadpancakelinus' on conflict do nothing;
--    See who is on the list:
-- select p.name, t.added_at from public.trumps_testers t join public.profiles p on p.id = t.user_id;
--    Remove someone:
-- delete from public.trumps_testers where user_id = (select id from public.profiles where name ilike 'someone');
