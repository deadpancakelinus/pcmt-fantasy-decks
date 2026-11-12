-- PCMT Fantasy Decks: players and teams edited or added on the backend (Player prices and Teams tabs, Nov 12 2026).
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once.
-- Needs setup/vp-setup.sql (is_freshbatch) and setup/subs-setup.sql (vp_ingest) first.
--
--   * deck_teams: a team added or changed on the backend (Teams tab). code is the team's code on PCMT.gg (results
--     reach players by team code + name), logo a picture URL (PCMT.gg's or an uploaded one, as a data: URL).
--   * deck_players: a player added or changed on the backend. A row with the id of a player in players.js replaces
--     that player's name, team, region, role and start price; any other id adds a player to The Deck.
--   Everyone can read both (the site applies them on every page load, league.js); only PCMT Team staff can write.
--   * deck_merge_players(players): players.js's list with deck_players applied, so scoring on the server (vp_ingest)
--     sees the same players and teams as the site.

create table if not exists public.deck_teams (
  code text primary key check (code ~ '^[A-Za-z0-9]{1,8}$'),
  name text not null check (length(name) between 1 and 60),
  color text not null default '#a5dcdd' check (color ~ '^#[0-9a-fA-F]{6}$'),
  region text not null default 'NA' check (region in ('NA', 'EMEA')),
  season text,                                  -- 'S4' etc.; shown with the team
  logo text check (logo is null or length(logo) <= 400000),
  retired boolean not null default false,       -- out of the store and saved decks (past seasons)
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create table if not exists public.deck_players (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (length(name) between 1 and 40),
  team text not null check (length(team) between 1 and 8),
  region text check (region is null or region in ('NA', 'EMEA')),   -- null: the team's region
  role text not null check (role in ('duelist', 'initiator', 'controller', 'sentinel')),
  price numeric(4, 1) not null check (price >= 0 and price <= 30 and price * 2 = round(price * 2)),   -- start price
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.deck_teams enable row level security;
alter table public.deck_players enable row level security;
drop policy if exists "anyone reads deck teams" on public.deck_teams;
create policy "anyone reads deck teams" on public.deck_teams for select using (true);
drop policy if exists "staff edit deck teams" on public.deck_teams;
create policy "staff edit deck teams" on public.deck_teams for all using ((select public.is_freshbatch())) with check ((select public.is_freshbatch()));
drop policy if exists "anyone reads deck players" on public.deck_players;
create policy "anyone reads deck players" on public.deck_players for select using (true);
drop policy if exists "staff edit deck players" on public.deck_players;
create policy "staff edit deck players" on public.deck_players for all using ((select public.is_freshbatch())) with check ((select public.is_freshbatch()));
grant select on public.deck_teams, public.deck_players to anon, authenticated;
grant insert, update, delete on public.deck_teams, public.deck_players to authenticated;

create or replace function public.deck_edit_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists deck_teams_stamp on public.deck_teams;
create trigger deck_teams_stamp before insert or update on public.deck_teams for each row execute function public.deck_edit_stamp();
drop trigger if exists deck_players_stamp on public.deck_players;
create trigger deck_players_stamp before insert or update on public.deck_players for each row execute function public.deck_edit_stamp();

create or replace function public.deck_merge_players(p_players jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  with base as (
    select x, ord from jsonb_array_elements(coalesce(p_players, '[]'::jsonb)) with ordinality t(x, ord)),
  merged as (
    select coalesce(b.x, '{}'::jsonb) || case when d.id is null then '{}'::jsonb else
             jsonb_build_object('id', d.id, 'name', d.name, 'team', d.team, 'role', d.role, 'price', d.price)
             || case when d.region is null then '{}'::jsonb else jsonb_build_object('regions', jsonb_build_array(d.region)) end end x,
           coalesce(b.ord, 100000) ord, d.id did
    from base b full join public.deck_players d on d.id = b.x ->> 'id')
  select coalesce(jsonb_agg(x order by ord, did), '[]'::jsonb) from merged
$$;

create or replace function public.vp_ingest(p_data_js text, p_players_js text, p_now timestamptz default now(), p_pay boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare res jsonb; mk jsonb; subs jsonb; plist jsonb := public.deck_merge_players(public.vp_extract(p_players_js, 'PCMT_SITE_PLAYERS'));
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

-- pcmt_fetch(path): one page of pcmt.gg for the backend's "Import from PCMT.gg" (Teams tab). The browser can't read
-- pcmt.gg itself (no CORS), so the server fetches it. PCMT Team staff only, and only these pages: the events list and
-- each event's matches (/api/matches...json), an event page and its team pages (/events/<event>[/teams/<team>]),
-- and player pages (/players/<name>, for the agents they play).
create or replace function public.pcmt_fetch(p_path text) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare st int; body text;
begin
  if not (public.is_freshbatch() or exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid())) then
    raise exception 'Only PCMT Team staff can read PCMT.gg from here.';
  end if;
  if p_path is null or p_path !~ '^/(api/matches(/[a-z0-9-]+)?\.json|events/[a-z0-9-]+(/teams/[a-z0-9-]+)?|players/[A-Za-z0-9%._~-]{1,80})$' then
    raise exception 'That page of PCMT.gg isn''t allowed: %', p_path;
  end if;
  select status, content into st, body from extensions.http_get('https://pcmt.gg' || p_path);
  if st <> 200 then raise exception 'PCMT.gg answered % for %', st, p_path; end if;
  return body;
end $$;
revoke all on function public.pcmt_fetch(text) from public, anon;
grant execute on function public.pcmt_fetch(text) to authenticated;
