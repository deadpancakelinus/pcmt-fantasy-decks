-- PCMT Fantasy Decks: LosersQ (losersq.html) on the backend's Pages list, not launched.
-- Paste into Supabase → SQL Editor → Run. Needs setup/pages-setup.sql first. Safe to run more than once.
-- Staff and site admins open it from backend.html (Pages tab → Open); everyone else is sent to Home.
-- Before pressing Launch, add a LosersQ link to the menu and Home tiles.
insert into public.site_pages (id, name, path, sort) values ('losersq', 'LosersQ', 'losersq.html', 4)
on conflict (id) do nothing;
