-- Pick'ems split for the live promo slide (update-2, not live yet). Paste into the Supabase SQL editor on release day.
-- fantasy.pcmt.gg/promo/pickems.html (the "Pick'ems slide" on the S4 break screen) shows how many players picked each
-- team in a game. This gives anyone those totals per game and team, nothing else: no names, no accounts, no single picks.
-- Safe to run again.

create or replace function public.pickem_split(p_event text)
returns table (series int, team text, picks int, pickers int)
language sql stable security definer set search_path = public as $$
  select p.series, p.winner, count(*)::int,
         (select count(distinct q.user_id)::int from pickem_picks q where q.event = p_event)
  from pickem_picks p
  where p.event = p_event and exists (select 1 from pickem_events e where e.id = p_event)
  group by p.series, p.winner
$$;
revoke all on function public.pickem_split(text) from public;
grant execute on function public.pickem_split(text) to anon, authenticated;
