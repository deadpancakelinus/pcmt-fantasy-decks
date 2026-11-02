-- PCMT Fantasy Decks: subs (backend.html, Subs tab). Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- Needs setup/vp-setup.sql first (vp_week_start, vp_week_end). The same table and functions are in vp-setup.sql; this file is just them, to add them to a live project.

-- Subs (backend.html, Subs tab, from Nov 1 2026): "<sub> played for <player>" in one gameweek (week = its start, as
-- vp_week_start gives it). In that gameweek's series where <sub> played (in data.js as "~<sub>", someone not listed on that
-- team) and <player> didn't, with <player>'s team in it, the sub's numbers count as <player>'s. A sub only lasts its own
-- gameweek: nothing carries into later games. Staff can add or remove one until that gameweek ends (when its points are
-- paid); after that it's fixed, and kept so the week's points stay on the Leaderboard.
-- vp_apply_subs() here and applySubs() in league.js do the same thing.
create table if not exists public.player_subs (
  id bigserial primary key,
  sub text not null check (sub = lower(sub) and length(sub) between 1 and 40),   -- PCMT.gg name, lower case
  player text not null check (length(player) between 1 and 40),                    -- players.js id
  week timestamptz,                                                                -- start of its gameweek
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
alter table public.player_subs add column if not exists week timestamptz;
update public.player_subs set week = public.vp_week_start(created_at) where week is null;   -- subs saved before weeks were added
alter table public.player_subs alter column week set not null;
alter table public.player_subs drop constraint if exists player_subs_sub_player_key;
do $$ begin alter table public.player_subs add constraint player_subs_sub_player_week_key unique (sub, player, week); exception when duplicate_table or duplicate_object then null; end $$;
alter table public.player_subs enable row level security;
drop policy if exists "anyone can read subs" on public.player_subs;
create policy "anyone can read subs" on public.player_subs for select using (true);
drop policy if exists "staff add subs" on public.player_subs;
create policy "staff add subs" on public.player_subs for insert
  with check ((exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch()) and created_by = auth.uid()
              and week = public.vp_week_start(week) and public.vp_week_end(week) > now());
drop policy if exists "staff remove subs" on public.player_subs;
create policy "staff remove subs" on public.player_subs for delete
  using ((exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch()) and public.vp_week_end(week) > now());

-- Applies the subs to one result (see player_subs). p_subs = [{ sub, player, week }] oldest first; p_players = players.js.
-- Moves "~<sub>"'s stats and per-map kills to <player> and records "subs": { "<player>": "<sub>" }.
create or replace function public.vp_apply_subs(r jsonb, p_subs jsonb, p_players jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare s jsonb; k text; id text; st jsonb; team text; maps jsonb; done jsonb := '{}'::jsonb;
begin
  if public.vp_ts(r ->> 'start') is null or public.vp_ts(r ->> 'start') < timestamptz '2026-11-01 00:00:00+00' then return r; end if;
  for s in select x from jsonb_array_elements(coalesce(p_subs, '[]'::jsonb)) x loop
    k := '~' || lower(s ->> 'sub'); id := s ->> 'player'; st := coalesce(r -> 'stats', '{}'::jsonb);
    if not (st ? k) or st ? id then continue; end if;
    if s ->> 'week' is null or public.vp_week_start(public.vp_ts(r ->> 'start')) <> (s ->> 'week')::timestamptz then continue; end if;   -- its own gameweek only
    select x ->> 'team' into team from jsonb_array_elements(p_players) x where x ->> 'id' = id limit 1;
    if team is null or team not in (r ->> 'a', r ->> 'b') then continue; end if;
    r := jsonb_set(r, '{stats}', (st - k) || jsonb_build_object(id, st -> k));
    if jsonb_typeof(r -> 'maps') = 'array' then
      select coalesce(jsonb_agg(case when jsonb_typeof(m -> 'k') = 'object' and m -> 'k' ? k
                                     then jsonb_set(m, '{k}', ((m -> 'k') - k) || jsonb_build_object(id, m -> 'k' -> k)) else m end order by i), '[]'::jsonb)
        into maps from jsonb_array_elements(r -> 'maps') with ordinality t(m, i);
      r := jsonb_set(r, '{maps}', maps);
    end if;
    done := done || jsonb_build_object(id, lower(s ->> 'sub'));
  end loop;
  if done <> '{}'::jsonb then r := r || jsonb_build_object('subs', done); end if;
  return r;
end $$;

create or replace function public.vp_ingest(p_data_js text, p_players_js text, p_now timestamptz default now(), p_pay boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare res jsonb; mk jsonb; subs jsonb; plist jsonb := public.vp_extract(p_players_js, 'PCMT_SITE_PLAYERS');
begin
  -- 4Ks and 5Ks from the backend, attached to each result as "multi": {"<player id>": [4Ks, 5Ks]}
  select coalesce(jsonb_object_agg(series, pl), '{}'::jsonb) into mk from (
    select series, jsonb_object_agg(player, jsonb_build_array(k4, k5)) pl from public.multikills where k4 > 0 or k5 > 0 group by series) q;
  -- Subs from the backend (player_subs): the sub's numbers count as the player they played for
  select coalesce(jsonb_agg(jsonb_build_object('sub', sub, 'player', player, 'week', week) order by id), '[]'::jsonb) into subs from public.player_subs;
  select coalesce(jsonb_agg(public.vp_apply_subs(x, subs, plist) || jsonb_build_object('multi', coalesce(mk -> ((x ->> 'start') || '|' || (x ->> 'a') || '|' || (x ->> 'b')), '{}'::jsonb))), '[]'::jsonb)
    into res from jsonb_array_elements(public.vp_extract(p_data_js, 'PCMT_RESULTS')) x;
  return public.vp_compute(public.vp_extract(p_data_js, 'PCMT_MATCHES'), res,
                           plist, public.vp_extract(p_players_js, 'PCMT_SITE_TWIN'),
                           p_now, p_pay);
end $$;
