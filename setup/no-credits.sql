-- Credits are gone (Nov 23 2026, with the Store, Library and staff Database pages). Run on release day of the update
-- that removes them. Safe to run again. Points (The Deck, the Leaderboard, Pick'ems standings) don't use any of this.
-- The old tables (vp_ledger, cards, card_packs, user_cards, player_database ...) are kept, unused; nothing is dropped.

-- Stop the hourly Credits payout (vp_sync). The Pick'ems sync (pcmt-pickems) keeps running: it keeps locks and standings.
select cron.unschedule('pcmt-vp-payout') where exists (select 1 from cron.job where jobname = 'pcmt-vp-payout');

-- Pick'ems stop paying Credits for right picks.
update public.pickem_events set credits_win = 0, credits_exact = 0 where credits_win <> 0 or credits_exact <> 0;

-- The deleted pages leave the backend's Pages list (it hides them anyway).
delete from public.site_pages where id in ('store', 'library', 'database');
