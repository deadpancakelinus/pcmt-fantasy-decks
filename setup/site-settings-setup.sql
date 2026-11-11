-- PCMT Fantasy Decks: site settings (backend.html, Patch notes tab → Current version). Paste into Supabase → SQL Editor → Run.
-- Safe to run more than once. Needs setup/backend-setup.sql first (pcmt_admins, is_freshbatch).
-- key 'version': the version at the bottom of every page ("Version 1.3"), read by version.js. Anyone can read; staff can change.
create table if not exists public.site_settings (
  key text primary key check (key ~ '^[a-z_]{1,40}$'),
  value text not null check (length(value) <= 200),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table public.site_settings enable row level security;
drop policy if exists "anyone reads site settings" on public.site_settings;
create policy "anyone reads site settings" on public.site_settings for select using (true);
drop policy if exists "staff write site settings" on public.site_settings;
create policy "staff write site settings" on public.site_settings for all
  using (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch())
  with check (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch());
grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;
insert into public.site_settings (key, value) values ('version', '1.3') on conflict (key) do nothing;
