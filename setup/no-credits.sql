-- Credits are gone (Nov 23 2026, with the Store, Library and staff Database pages). Run on release day of the update
-- that removes them. Safe to run again. Points don't change: The Deck, the Leaderboard and the Pick'ems standings
-- (a right pick still earns its event's points, pickem_events.credits_win, shown on the site as points) stay as they are.
-- The old tables (vp_ledger, cards, card_packs, user_cards, player_database ...) are kept, unused; nothing is dropped.

-- Stop the hourly Credits payout (vp_sync). The Pick'ems sync (pcmt-pickems) keeps running: it keeps locks and standings.
select cron.unschedule('pcmt-vp-payout') where exists (select 1 from cron.job where jobname = 'pcmt-vp-payout');

-- The deleted pages leave the backend's Pages list (it hides them anyway).
delete from public.site_pages where id in ('store', 'library', 'database');
