-- PCMT Fantasy Decks: game-by-game Pick'ems (NA Season 4) and the regional Pick'ems leaderboards (Nov 12 2026).
-- Paste into Supabase → SQL Editor → Run. Needs setup/pickems-setup.sql first. Safe to run more than once.
--
-- A bracket in pickems.js with "mode": "games" is a list of single games, added by the hourly sync as PCMT.gg schedules
-- them. There's no bracket-wide lock: each game locks when it starts (pickem_resolve), and picks save one game at a time
-- (save_pick). The right winner pays credits_win, like the brackets.

create or replace function public.pickem_lock_time(p_bracket jsonb) returns timestamptz
language sql immutable set search_path = public as $$
  select min((s ->> 'start')::timestamptz) - interval '6 hours'
  from jsonb_array_elements(p_bracket -> 'series') s
  where jsonb_typeof(s -> 'start') = 'string' and jsonb_typeof(s -> 'score') <> 'array'
    and coalesce(p_bracket ->> 'mode', '') <> 'games'   -- game-by-game Pick'ems: each game locks on its own when it starts
$$;

-- NA Season 4 is open to everyone from the start.
insert into public.pickem_events (id, open) values ('na-s4', true) on conflict (id) do update set open = true;

-- The Leaderboard's "NA niche" and "EMEA niche": everyone's Pick'ems across every event of one region (pickems.js
-- "region"), one point per right winner.
create or replace function public.pickem_region_standings(p_region text)
returns table (user_id uuid, name text, points integer, picked integer)
language sql stable security definer set search_path = public as $$
  with r as (
    select st.event, (x ->> 'n')::int n, x ->> 'winner' winner
    from public.pickem_state st, jsonb_array_elements(public.pickem_resolve(st.data)) x
    where upper(st.data ->> 'region') = upper(p_region) and x ->> 'winner' is not null)
  select p.user_id, coalesce(pr.name, 'Manager'),
         count(*) filter (where p.winner = r.winner)::int,
         count(*)::int
  from public.pickem_picks p join r on r.event = p.event and r.n = p.series
  left join public.profiles pr on pr.id = p.user_id
  group by p.user_id, pr.name
$$;
revoke all on function public.pickem_region_standings(text) from public;
grant execute on function public.pickem_region_standings(text) to anon, authenticated;
