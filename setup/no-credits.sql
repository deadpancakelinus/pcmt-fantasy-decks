-- Credits are gone (Nov 23 2026, with the Store, Library and staff Database pages). Run on release day of the update
-- that removes them. Safe to run again. Points on The Deck and the Leaderboard don't use any of this. The NA/EMEA Pick'ems standings
-- used each event's Credits as its points per right pick; below they switch to 1 point per right pick first.
-- The old tables (vp_ledger, cards, card_packs, user_cards, player_database ...) are kept, unused; nothing is dropped.

-- Stop the hourly Credits payout (vp_sync). The Pick'ems sync (pcmt-pickems) keeps running: it keeps locks and standings.
select cron.unschedule('pcmt-vp-payout') where exists (select 1 from cron.job where jobname = 'pcmt-vp-payout');

-- NA/EMEA Pick'ems standings: 1 point per right pick (the per-event standings already count 1), so setting Credits
-- to 0 below doesn't zero them.
create or replace function public.pickem_region_standings(p_region text)
 returns table(user_id uuid, name text, points integer, picked integer)
 language sql stable security definer set search_path to 'public' as $function$
  with r as (
    select st.event, (x ->> 'n')::int n, x ->> 'winner' winner
    from public.pickem_state st,
    jsonb_array_elements(public.pickem_resolve(st.data)) x
    where upper(st.data ->> 'region') = upper(p_region) and x ->> 'winner' is not null)
  select p.user_id, coalesce(pr.username, pr.name, 'Manager'),
         (count(*) filter (where p.winner = r.winner))::int,
         count(*)::int
  from public.pickem_picks p join r on r.event = p.event and r.n = p.series
  left join public.profiles pr on pr.id = p.user_id
  group by p.user_id, pr.username, pr.name
$function$;

-- Pick'ems stop paying Credits for right picks.
update public.pickem_events set credits_win = 0, credits_exact = 0 where credits_win <> 0 or credits_exact <> 0;

-- The deleted pages leave the backend's Pages list (it hides them anyway).
delete from public.site_pages where id in ('store', 'library', 'database');
