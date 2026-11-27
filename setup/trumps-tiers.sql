-- MVP VS tiers (Nov 26 2026): Iron 1 to Radiant, like Valorant's ranks. Only online games against another player count:
-- every win is a point, and every 5 wins moves you up one tier (Iron 1 -> Iron 2 -> ... -> Immortal 3 -> Radiant at 120).
-- Losses and draws don't take anything away. Games against the bot never count.
-- Run once in the Supabase SQL editor (after setup/trumps-setup.sql). Safe to run again.

-- One row per finished online game that had a winner (room code + the game's seed: codes come back after a day).
create table if not exists public.trumps_results (
  id bigint generated always as identity primary key,
  code text not null,
  seed bigint not null default 0,
  winner uuid not null references auth.users (id) on delete cascade,
  loser uuid not null references auth.users (id) on delete cascade,
  deck text not null default '',
  rounds int not null default 0,
  at timestamptz not null default now()
);
create unique index if not exists trumps_results_game on public.trumps_results (code, seed);
create index if not exists trumps_results_winner on public.trumps_results (winner);
alter table public.trumps_results enable row level security;
drop policy if exists "read results" on public.trumps_results;
create policy "read results" on public.trumps_results for select using (true);   -- tiers are public, like the leaderboards

-- A move replaces the game state, but only if nobody else moved first (p_version must match). The move that ends a
-- game with a winner also records the win, once per room. The winner has to be the player holding more cards (or all
-- of them), and the two seats have to be two different players.
create or replace function public.trumps_move(p_code text, p_version int, p_state jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v int; r public.trumps_rooms; w int; n0 int; n1 int;
begin
  if not public.trumps_can_play() then raise exception 'Log in with Discord to play online.'; end if;
  update public.trumps_rooms
     set state = p_state, version = version + 1, updated_at = now()
   where code = upper(trim(p_code)) and version = p_version and guest is not null
     and auth.uid() in (host, guest)
  returning * into r;
  if r.code is null then raise exception 'The game moved on. Refreshing.'; end if;
  v := r.version;
  if jsonb_typeof(p_state -> 'over') = 'object' and r.host <> r.guest then
    w := (p_state -> 'over' ->> 'winner')::int;
    n0 := jsonb_array_length(coalesce(p_state -> 'hands' -> 0, '[]'::jsonb));
    n1 := jsonb_array_length(coalesce(p_state -> 'hands' -> 1, '[]'::jsonb));
    if (w = 0 and n0 > n1) or (w = 1 and n1 > n0) then
      insert into public.trumps_results (code, seed, winner, loser, deck, rounds)
      values (r.code, coalesce((p_state ->> 'seed')::bigint, 0), case when w = 0 then r.host else r.guest end, case when w = 0 then r.guest else r.host end,
              r.region, coalesce((p_state ->> 'round')::int - 1, 0))
      on conflict (code, seed) do nothing;
    end if;
  end if;
  return v;
end $$;

-- Online wins for a list of players (the page works out the tier: 5 wins a tier).
create or replace function public.trumps_wins(p_ids uuid[]) returns table (user_id uuid, wins int)
language sql stable security definer set search_path = public as $$
  select u, (select count(*)::int from public.trumps_results where winner = u) from unnest(p_ids) u;
$$;

-- The MVP VS leaderboard and the tier logos on the other leaderboards: everyone who has finished a counted online game
-- (won or lost), with their wins, games, name and picture.
create or replace function public.trumps_ladder() returns table (user_id uuid, name text, avatar_url text, picture_at timestamptz, wins int, games int)
language sql stable security definer set search_path = public as $$
  with g as (select winner as u, 1 as w from public.trumps_results union all select loser, 0 from public.trumps_results)
  select g.u, coalesce(nullif(p.username, ''), p.name, 'Manager'), p.avatar_url, p.picture_at, sum(g.w)::int, count(*)::int
  from g left join public.profiles p on p.id = g.u
  group by g.u, p.username, p.name, p.avatar_url, p.picture_at;
$$;

revoke all on function public.trumps_move(text, int, jsonb) from public, anon;
grant execute on function public.trumps_move(text, int, jsonb) to authenticated;
grant execute on function public.trumps_wins(uuid[]) to anon, authenticated;
grant execute on function public.trumps_ladder() to anon, authenticated;
