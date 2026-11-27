-- MVP VS online rooms for 2 to 4 players (Nov 27 2026). Run after trumps-setup.sql, trumps-seasons.sql and
-- trumps-tiers.sql. Safe to run again.
--
-- A room keeps its seats in order: players[1] is the host, then everyone who joined (up to 4). The host deals with
-- trumps_start once 2 or more are in; until then players can join or leave (the host leaving closes the room).
-- host / guest stay filled in (seats 1 and 2) for anything that still reads them.

-- 1) Rooms: the seats, their names, and whether the cards have been dealt.
alter table public.trumps_rooms add column if not exists players uuid[] not null default '{}';
alter table public.trumps_rooms add column if not exists names text[] not null default '{}';
alter table public.trumps_rooms add column if not exists started boolean not null default false;
update public.trumps_rooms
   set players = array_remove(array[host, guest], null),
       names = array_remove(array[host_name, guest_name], null),
       started = guest is not null
 where cardinality(players) = 0;
alter table public.trumps_rooms drop constraint if exists trumps_rooms_seats;
alter table public.trumps_rooms add constraint trumps_rooms_seats check (cardinality(players) between 1 and 4 and cardinality(names) = cardinality(players));

drop policy if exists "players read their rooms" on public.trumps_rooms;
create policy "players read their rooms" on public.trumps_rooms for select
  using (auth.uid() = any (players));

-- 2) Results: every seat in the game (the win still counts once, for the winner).
alter table public.trumps_results add column if not exists players uuid[] not null default '{}';
update public.trumps_results set players = array[winner, loser] where cardinality(players) = 0;

-- 3) Room functions.
create or replace function public.trumps_create(p_region text, p_state jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare c text; n int := 0; nm text;
begin
  if not public.trumps_can_play() then raise exception 'Log in with Discord to play online.'; end if;
  if p_region !~ '^(na|emea)(s[0-9]{1,2})?(\+(na|emea)s[0-9]{1,2}){0,15}$' then raise exception 'Unknown deck.'; end if;
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
  nm := coalesce((select coalesce(nullif(username, ''), name) from public.profiles where id = auth.uid()), 'Player 1');
  insert into public.trumps_rooms (code, region, host, host_name, state, players, names)
  values (c, p_region, auth.uid(), nm, p_state, array[auth.uid()], array[nm]);
  return c;
end $$;

create or replace function public.trumps_join(p_code text) returns public.trumps_rooms
language plpgsql security definer set search_path = public as $$
declare r public.trumps_rooms; nm text;
begin
  if not public.trumps_can_play() then raise exception 'Log in with Discord to play online.'; end if;
  select * into r from public.trumps_rooms where code = upper(trim(p_code)) for update;
  if not found then raise exception 'No room with that code.'; end if;
  if auth.uid() = any (r.players) then return r; end if;
  if r.started then raise exception 'That game has already started.'; end if;
  if cardinality(r.players) >= 4 then raise exception 'That room is full (4 players).'; end if;
  nm := coalesce((select coalesce(nullif(username, ''), name) from public.profiles where id = auth.uid()), 'Player ' || (cardinality(r.players) + 1));
  update public.trumps_rooms
     set players = players || auth.uid(), names = names || nm,
         guest = coalesce(guest, auth.uid()), guest_name = coalesce(guest_name, nm),
         version = version + 1, updated_at = now()
   where code = r.code
  returning * into r;
  return r;
end $$;

-- The host deals: p_state must have one hand per seat. Returns the room's new version.
create or replace function public.trumps_start(p_code text, p_version int, p_state jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r public.trumps_rooms;
begin
  if not public.trumps_can_play() then raise exception 'Log in with Discord to play online.'; end if;
  select * into r from public.trumps_rooms where code = upper(trim(p_code)) for update;
  if not found then raise exception 'No room with that code.'; end if;
  if r.players[1] is distinct from auth.uid() then raise exception 'Only the player who made the room can start it.'; end if;
  if r.started then raise exception 'The game has already started.'; end if;
  if cardinality(r.players) < 2 then raise exception 'Wait for at least one more player.'; end if;
  if r.version <> p_version or jsonb_array_length(coalesce(p_state -> 'hands', '[]'::jsonb)) <> cardinality(r.players) then
    raise exception 'Someone joined or left just now. Try again.';
  end if;
  update public.trumps_rooms set state = p_state, started = true, version = version + 1, updated_at = now()
   where code = r.code returning version into r.version;
  return r.version;
end $$;

-- Leaving before the deal gives the seat back; the host leaving closes the room. After the deal it does nothing.
create or replace function public.trumps_leave(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.trumps_rooms; i int;
begin
  select * into r from public.trumps_rooms where code = upper(trim(p_code)) for update;
  if not found or r.started or not (auth.uid() = any (r.players)) then return; end if;
  if r.players[1] = auth.uid() then delete from public.trumps_rooms where code = r.code; return; end if;
  i := array_position(r.players, auth.uid());
  update public.trumps_rooms
     set players = players[1:i - 1] || players[i + 1:], names = names[1:i - 1] || names[i + 1:],
         version = version + 1, updated_at = now()
   where code = r.code
  returning * into r;
  update public.trumps_rooms set guest = r.players[2], guest_name = r.names[2] where code = r.code;
end $$;

-- A move replaces the game state, but only if nobody else moved first (p_version must match). The move that ends a
-- game with a winner also records the win, once per game. The winner has to hold strictly the most cards.
create or replace function public.trumps_move(p_code text, p_version int, p_state jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v int; r public.trumps_rooms; w int; n int; most int := -1; wc int; second int := -1; runner int; k int; c int;
begin
  if not public.trumps_can_play() then raise exception 'Log in with Discord to play online.'; end if;
  update public.trumps_rooms
     set state = p_state, version = version + 1, updated_at = now()
   where code = upper(trim(p_code)) and version = p_version and started
     and auth.uid() = any (players)
  returning * into r;
  if r.code is null then raise exception 'The game moved on. Refreshing.'; end if;
  v := r.version;
  n := cardinality(r.players);
  if jsonb_typeof(p_state -> 'over') = 'object' and n >= 2 and jsonb_array_length(coalesce(p_state -> 'hands', '[]'::jsonb)) = n then
    w := (p_state -> 'over' ->> 'winner')::int;
    if w >= 0 and w < n then
      wc := jsonb_array_length(p_state -> 'hands' -> w);
      for k in 0 .. n - 1 loop
        c := jsonb_array_length(p_state -> 'hands' -> k);
        if k <> w then
          if c >= wc then wc := -1; end if;          -- someone else holds as many cards: no win
          if c > second then second := c; runner := k; end if;
        end if;
      end loop;
      if wc >= 0 and (select count(distinct x) from unnest(r.players) x) = n then
        insert into public.trumps_results (code, seed, winner, loser, deck, rounds, players)
        values (r.code, coalesce((p_state ->> 'seed')::bigint, 0), r.players[w + 1], r.players[runner + 1],
                r.region, coalesce((p_state ->> 'round')::int - 1, 0), r.players)
        on conflict (code, seed) do nothing;
      end if;
    end if;
  end if;
  return v;
end $$;

-- The MVP VS leaderboard: one row per player with their wins and games (every game they sat in).
create or replace function public.trumps_ladder() returns table (user_id uuid, name text, avatar_url text, picture_at timestamptz, wins int, games int)
language sql stable security definer set search_path = public as $$
  with g as (select unnest(r.players) as u, r.winner from public.trumps_results r)
  select g.u, coalesce(nullif(p.username, ''), p.name, 'Manager'), p.avatar_url, p.picture_at,
         count(*) filter (where g.u = g.winner)::int, count(*)::int
  from g left join public.profiles p on p.id = g.u
  group by g.u, p.username, p.name, p.avatar_url, p.picture_at;
$$;

revoke all on function public.trumps_create(text, jsonb), public.trumps_join(text), public.trumps_start(text, int, jsonb),
  public.trumps_leave(text), public.trumps_move(text, int, jsonb) from public, anon;
grant execute on function public.trumps_create(text, jsonb), public.trumps_join(text), public.trumps_start(text, int, jsonb),
  public.trumps_leave(text), public.trumps_move(text, int, jsonb) to authenticated;
grant execute on function public.trumps_ladder() to anon, authenticated;
