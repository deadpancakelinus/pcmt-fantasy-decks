-- PCMT.gg events on the backend (Schedule tab): staff label each live PCMT.gg event Groups or Playoffs, and the hourly
-- PCMT.gg sync (tools/pcmt-sync.js) builds its Pick'ems from the label.
--   groups:   game-by-game Pick'ems. Every game PCMT.gg schedules is its own pick, and each game locks when it starts.
--   playoffs: a bracket (format from pickem-formats.js, seeds S1, S2 ... = team codes) that players pick in full
--             before the lock date. The lock is pickem_events.lock_at, set by staff; while it's empty the bracket
--             locks 6 hours before its first game (pickem_check_lock), as before.
-- bracket = the pickems.js id the label writes to (e.g. na-s4, na-s4-playoffs). An event that already has a hand-made
-- bracket in pickems.js (EMEA S2) keeps it: the label only points at it.
-- Anyone can read the labels (the sync reads them with the publishable key; nothing private in them). Staff and site
-- admins write. Safe to run again.

create table if not exists public.pcmt_event_labels (
  event      text primary key,                 -- PCMT.gg event id, e.g. s4-na
  name       text,                             -- PCMT.gg's name, e.g. NA Season 4
  region     text check (region in ('NA', 'EMEA')),
  season     integer,
  label      text check (label in ('groups', 'playoffs')),
  format     text,                             -- playoffs: a pickem-formats.js key (de10, de8bye, de8, se8, se4)
  seeds      jsonb not null default '{}'::jsonb,   -- playoffs: { "S1": "TEAM", ... }
  bracket    text,                             -- the pickems.js id it writes to
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  check (label is distinct from 'playoffs' or format is not null)
);
alter table public.pcmt_event_labels enable row level security;

drop policy if exists "anyone reads event labels" on public.pcmt_event_labels;
create policy "anyone reads event labels" on public.pcmt_event_labels for select using (true);
drop policy if exists "staff add event labels" on public.pcmt_event_labels;
create policy "staff add event labels" on public.pcmt_event_labels for insert
  with check (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch());
drop policy if exists "staff change event labels" on public.pcmt_event_labels;
create policy "staff change event labels" on public.pcmt_event_labels for update
  using (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch())
  with check (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch());
drop policy if exists "staff remove event labels" on public.pcmt_event_labels;
create policy "staff remove event labels" on public.pcmt_event_labels for delete
  using (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch());
grant select on public.pcmt_event_labels to anon, authenticated;
grant insert, update, delete on public.pcmt_event_labels to authenticated;

-- Staff make the Pick'ems event for a label (open, points per right pick) and set a playoff bracket's lock date.
drop policy if exists "staff add pickem events" on public.pickem_events;
create policy "staff add pickem events" on public.pickem_events for insert with check (public.is_freshbatch());
grant insert (id, open, credits_win, lock_at) on public.pickem_events to authenticated;
grant update (lock_at) on public.pickem_events to authenticated;

-- What's there now: NA Season 4 is the game-by-game na-s4, EMEA Season 2 is the hand-made emea-s2 bracket.
insert into public.pcmt_event_labels (event, name, region, season, label, format, bracket) values
  ('s4-na', 'NA Season 4', 'NA', 4, 'groups', null, 'na-s4'),
  ('s2-emea', 'EMEA Season 2', 'EMEA', 2, 'playoffs', 'de10', 'emea-s2')
on conflict (event) do nothing;
