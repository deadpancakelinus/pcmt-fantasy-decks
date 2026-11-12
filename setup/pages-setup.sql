-- PCMT Fantasy Decks: pages waiting for launch (backend.html, Pages tab).
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once.
-- Needs setup/vp-setup.sql (freshbatch_staff, is_freshbatch) and setup/cards-setup.sql (card_packs) first.
--
--   * site_pages: one row per page that isn't public yet. Everyone can read it; the site hides links to pages
--     that aren't launched and sends visitors (except staff and admins) to Home.
--   * fb_launch_page(page): staff only. Launches a page for everyone. It can't be undone from the site; to hide
--     a page again: update public.site_pages set launched = false, launched_at = null, launched_by = null where id = '<page>';
--   * Launching the Store also opens every card pack to everyone (card_packs.open_to_all = true).

create table if not exists public.site_pages (
  id text primary key,            -- 'mvp-vs', 'store', 'library'
  name text not null,
  path text not null,             -- the page's file on the site
  sort integer not null default 0,
  launched boolean not null default false,
  launched_at timestamptz,
  launched_by uuid references auth.users (id) on delete set null
);
alter table public.site_pages enable row level security;
drop policy if exists "read site pages" on public.site_pages;
create policy "read site pages" on public.site_pages for select using (true);
insert into public.site_pages (id, name, path, sort) values
  ('mvp-vs', 'MVP VS', 'mvp-vs.html', 1),
  ('store', 'Store', 'store.html', 2),
  ('library', 'Library', 'library.html', 3)
on conflict (id) do nothing;

create or replace function public.fb_launch_page(p_page text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare pg public.site_pages;
begin
  if not public.is_freshbatch() then raise exception 'PCMT Team staff only.'; end if;
  select * into pg from public.site_pages where id = p_page for update;
  if not found then raise exception 'That page isn''t on the launch list.'; end if;
  if pg.launched then return pg.name || ' is already live.'; end if;
  update public.site_pages set launched = true, launched_at = now(), launched_by = auth.uid() where id = p_page;
  if p_page = 'store' then update public.card_packs set open_to_all = true where not open_to_all; end if;
  return pg.name || ' is live for everyone.';
end $$;
revoke all on function public.fb_launch_page(text) from public, anon;
grant execute on function public.fb_launch_page(text) to authenticated;

-- ===================== Every page on the Pages tab (Nov 12 2026) =====================
-- The pages that were always public are listed too (live), so staff see every page and can take one down.
-- Home and Log in aren't listed: Home is where hidden pages send people, and Log in has to stay open.
insert into public.site_pages (id, name, path, sort, launched, launched_at) values
  ('pickems', 'Pick''ems', 'pickems.html', -6, true, now()),
  ('leaderboard', 'The Deck Leaderboard', 'leaderboard.html', -5, true, now()),
  ('deck', 'The Deck', 'index.html', -4, true, now()),
  ('customization', 'Customization', 'customization.html', -3, true, now()),
  ('guide', 'Guide', 'guide.html', -2, true, now())
on conflict (id) do nothing;

-- fb_hide_page(page): staff only. Takes a live page down again: out of the menu and the Home tiles, and closed to
-- everyone but staff and admins (they're sent to Home). Launch puts it back.
create or replace function public.fb_hide_page(p_page text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare pg public.site_pages;
begin
  if not public.is_freshbatch() then raise exception 'PCMT Team staff only.'; end if;
  select * into pg from public.site_pages where id = p_page for update;
  if not found then raise exception 'That page isn''t on the list.'; end if;
  if not pg.launched then return pg.name || ' is already hidden.'; end if;
  update public.site_pages set launched = false, launched_at = null, launched_by = null where id = p_page;
  return pg.name || ' is hidden. Only staff can open it now.';
end $$;
revoke all on function public.fb_hide_page(text) from public;
grant execute on function public.fb_hide_page(text) to authenticated;
