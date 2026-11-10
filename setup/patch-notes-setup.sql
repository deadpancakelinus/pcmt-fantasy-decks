-- PCMT Fantasy Decks: patch notes (backend.html, Patch notes tab). Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- Needs setup/backend-setup.sql first (pcmt_admins, is_freshbatch).
-- Staff write a title and a note and press Go live: the newest live note (by live_at) is the Latest Patch Notes on Home.
-- Everyone can read live notes; only site admins and PCMT Team staff can see drafts/taken-down notes or change them.
create table if not exists public.patch_notes (
  id bigserial primary key,
  title text not null check (length(title) between 1 and 120),
  body text not null check (length(body) between 1 and 8000),                    -- a blank line starts a new paragraph
  note_date date not null default ((now() at time zone 'America/New_York')::date),
  live boolean not null default false,
  live_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
alter table public.patch_notes enable row level security;
drop policy if exists "anyone reads live patch notes" on public.patch_notes;
create policy "anyone reads live patch notes" on public.patch_notes for select using (live);
drop policy if exists "staff read patch notes" on public.patch_notes;
create policy "staff read patch notes" on public.patch_notes for select
  using (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch());
drop policy if exists "staff write patch notes" on public.patch_notes;
create policy "staff write patch notes" on public.patch_notes for all
  using (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch())
  with check (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch());
grant select on public.patch_notes to anon, authenticated;
grant insert, update, delete on public.patch_notes to authenticated;
grant usage on sequence public.patch_notes_id_seq to authenticated;
