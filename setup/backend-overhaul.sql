-- Backend overhaul (update, not live yet). Paste into the Supabase SQL editor on release day, before the site goes out.
-- Dashboard stats, the Schedule tab's games, Season settings (NA stage dates), Pick'ems event settings and the staff list,
-- all staff-only (is_freshbatch()).

-- ---------- Page views: visits per page per day, no names or accounts ----------
-- league.js counts one view per page per browser session (pcmt_count_view). Only the dashboard reads the counts.
create table if not exists public.page_views (
  day date not null,
  page text not null check (page ~ '^[a-z0-9-]{1,30}$'),
  views int not null default 0,
  primary key (day, page)
);
alter table public.page_views enable row level security;   -- no policies: only the functions below touch it
create or replace function public.pcmt_count_view(p_page text) returns void
language sql security definer set search_path = public as $$
  insert into page_views (day, page, views)
  select (now() at time zone 'America/New_York')::date, lower(p_page), 1 where lower(coalesce(p_page, '')) ~ '^[a-z0-9-]{1,30}$'
  on conflict (day, page) do update set views = page_views.views + 1
$$;
revoke all on function public.pcmt_count_view(text) from public;
grant execute on function public.pcmt_count_view(text) to anon, authenticated;

-- ---------- Dashboard: league numbers for staff ----------
create or replace function public.fb_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if not public.is_freshbatch() then raise exception 'Staff only.'; end if;
  select jsonb_build_object(
    'now', now(),
    'accounts', (select count(*) from auth.users),
    'accounts_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'accounts_today', (select count(*) from auth.users where created_at > date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York'),
    'signups', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d), '[]'::jsonb) from (
        select to_char(g, 'YYYY-MM-DD') d, (select count(*) from auth.users u where (u.created_at at time zone 'America/New_York')::date = g::date) n
        from generate_series((now() at time zone 'America/New_York')::date - 13, (now() at time zone 'America/New_York')::date, interval '1 day') g) x),
    'managers', (select count(distinct user_id) from deck_history),
    'managers_na', (select count(distinct user_id) from deck_history where region = 'NA'),
    'managers_emea', (select count(distinct user_id) from deck_history where region = 'EMEA'),
    'managers_untagged', (select count(distinct user_id) from deck_history d where not exists (select 1 from deck_history e where e.user_id = d.user_id and e.region is not null)),
    'saves_7d', (select count(*) from deck_history where created_at > now() - interval '7 days'),
    'savers_7d', (select count(distinct user_id) from deck_history where created_at > now() - interval '7 days'),
    'saves_24h', (select count(*) from deck_history where created_at > now() - interval '24 hours'),
    'credits_paid', (select coalesce(sum(amount), 0) from vp_ledger where amount > 0),
    'credits_paid_7d', (select coalesce(sum(amount), 0) from vp_ledger where amount > 0 and created_at > now() - interval '7 days'),
    'credits_by_kind', (select coalesce(jsonb_object_agg(kind, s), '{}'::jsonb) from (select kind, sum(amount) s from vp_ledger group by kind) k),
    'credits_spent', (select coalesce(sum(price), 0) from pack_openings),
    'packs_opened', (select count(*) from pack_openings),
    'packs_opened_7d', (select count(*) from pack_openings where created_at > now() - interval '7 days'),
    'pack_openers', (select count(distinct user_id) from pack_openings),
    'cards_owned', (select coalesce(sum(count), 0) from user_cards),
    'collectors', (select count(distinct user_id) from user_cards),
    'complaints', (select count(*) from complaints),
    'complaints_7d', (select count(*) from complaints where created_at > now() - interval '7 days'),
    'mvp_rooms_7d', (select count(*) from trumps_rooms where created_at > now() - interval '7 days'),
    'pickems', (select coalesce(jsonb_agg(jsonb_build_object('event', e.id, 'open', e.open, 'worth', e.credits_win,
                   'pickers', (select count(distinct user_id) from pickem_picks p where p.event = e.id),
                   'picks', (select count(*) from pickem_picks p where p.event = e.id),
                   'split', (select coalesce(jsonb_object_agg(series::text, w), '{}'::jsonb) from (
                       select series, jsonb_object_agg(winner, n) w from (select series, winner, count(*) n from pickem_picks p where p.event = e.id group by 1, 2) a group by series) b)
                 ) order by e.id), '[]'::jsonb) from pickem_events e),
    'subs_open', (select count(*) from player_subs where week + interval '7 days' > now()),
    'last_sync', (select jsonb_build_object('at', ran_at, 'ok', ok, 'message', left(message, 200)) from vp_sync_log order by ran_at desc limit 1),
    'syncs_failed_24h', (select count(*) from vp_sync_log where not ok and ran_at > now() - interval '24 hours'),
    'pickems_synced', (select max(synced_at) from pickem_state),
    'views', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d), '[]'::jsonb) from (
        select to_char(g, 'YYYY-MM-DD') d, (select coalesce(sum(views), 0) from page_views v where v.day = g::date) n
        from generate_series((now() at time zone 'America/New_York')::date - 13, (now() at time zone 'America/New_York')::date, interval '1 day') g) x),
    'views_by_page_7d', (select coalesce(jsonb_object_agg(page, n), '{}'::jsonb) from (
        select page, sum(views) n from page_views where day > (now() at time zone 'America/New_York')::date - 7 group by page) x)
  ) into out;
  return out;
end $$;
revoke all on function public.fb_dashboard() from public, anon;
grant execute on function public.fb_dashboard() to authenticated;

-- ---------- Schedule: games added on the backend ----------
-- The hourly PCMT.gg sync (tools/pcmt-sync.js) writes these into data.js (the schedule) and, with pickem on, the
-- region's Pick'ems games (pickems.js) as hand-added games, and drops a removed one that has no result. When PCMT.gg
-- posts the game, the sync takes it over as before. The site also shows them straight away (league.js).
create table if not exists public.schedule_games (
  id bigint generated always as identity primary key,
  region text not null check (region in ('NA', 'EMEA')),
  start timestamptz not null,
  a text not null, b text not null check (a <> b),
  bo int not null default 3 check (bo in (1, 3, 5)),
  round text not null default '',
  pickem boolean not null default true,
  removed boolean not null default false,
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid default auth.uid()
);
alter table public.schedule_games enable row level security;
drop policy if exists "anyone reads the schedule" on public.schedule_games;
create policy "anyone reads the schedule" on public.schedule_games for select using (true);
drop policy if exists "staff write the schedule" on public.schedule_games;
create policy "staff write the schedule" on public.schedule_games for all using (public.is_freshbatch()) with check (public.is_freshbatch());
grant select on public.schedule_games to anon, authenticated;
grant insert, update on public.schedule_games to authenticated;

-- ---------- Season settings: NA stage dates live in site_settings 'na_stage' ----------
-- value = {"start": ISO, "lock": ISO, "end": ISO or null}; the Season tab writes it. Without it, the dates below.
create or replace function public.vp_na_stage(out start_at timestamptz, out lock_at timestamptz, out ends_at timestamptz)
language sql stable set search_path = public as $$
  with s as (select case when value ~ '^\s*\{' then value::jsonb end v from public.site_settings where key = 'na_stage')
  select coalesce((select (v ->> 'start')::timestamptz from s), timestamptz '2026-11-18 03:00:00+00'),
         coalesce((select (v ->> 'lock')::timestamptz from s), timestamptz '2026-11-22 02:00:00+00'),
         case when exists (select 1 from s where v ? 'end') then (select nullif(v ->> 'end', '')::timestamptz from s) end
$$;

-- ---------- Pick'ems: staff open / close events and set points ----------
drop policy if exists "staff write pickem events" on public.pickem_events;
create policy "staff write pickem events" on public.pickem_events for update using (public.is_freshbatch()) with check (public.is_freshbatch());
grant update (open, credits_win) on public.pickem_events to authenticated;

-- ---------- Staff list ----------
create or replace function public.fb_staff_list() returns table (user_id uuid, name text, username text, avatar text, added_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_freshbatch() then raise exception 'Staff only.'; end if;
  return query select s.user_id, p.name, to_jsonb(p) ->> 'username', p.avatar_url, s.added_at from freshbatch_staff s left join profiles p on p.id = s.user_id order by s.added_at;   -- username once usernames.sql is in
end $$;
create or replace function public.fb_staff_add(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_freshbatch() then raise exception 'Staff only.'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'No account with that id has logged in yet.'; end if;
  insert into freshbatch_staff (user_id) values (p_user) on conflict do nothing;
end $$;
create or replace function public.fb_staff_remove(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_freshbatch() then raise exception 'Staff only.'; end if;
  if p_user = auth.uid() then raise exception 'You can''t take yourself off the staff list.'; end if;
  if (select count(*) from freshbatch_staff) <= 1 then raise exception 'The staff list can''t be empty.'; end if;
  delete from freshbatch_staff where user_id = p_user;
end $$;
revoke all on function public.fb_staff_list() from public, anon;
revoke all on function public.fb_staff_add(uuid) from public, anon;
revoke all on function public.fb_staff_remove(uuid) from public, anon;
grant execute on function public.fb_staff_list(), public.fb_staff_add(uuid), public.fb_staff_remove(uuid) to authenticated;
