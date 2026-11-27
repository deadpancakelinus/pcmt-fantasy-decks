-- Comp games (backend.html, Comp games tab): every current player's ranked Valorant games and the RR they won or lost,
-- from HenrikDev's MMR history (/valorant/v2/mmr-history, the last ~20 ranked games per account), for the players with a
-- Riot ID in riot_ids (setup/riot-ids.sql). Staff and site admins only; nothing on the site reads it.
-- Run after setup/riot-ids.sql. Safe to run again.
--
-- Each player check is two HenrikDev calls: the ranked history (RR) and, for games without one yet, the stat lines (K/D/A).
-- fb_comp_fetch(n) checks the n players checked longest ago (at most 25 a call; HenrikDev's Basic key allows 30 calls a
-- minute, and more than 5 are spaced 3 seconds apart) and keeps every game it finds; fb_comp_fetch(1, player) checks one.
-- A scheduled job (pg_cron, 'pcmt-comp-games') runs it every 10 minutes for 15 players, so each player is checked about
-- every 1.5 hours. The backend checks 4 more at a time, or one player, on request
-- (the site's requests are cut off after 8 seconds).
-- The HenrikDev key stays in Supabase Vault as henrik_api_key.

create table if not exists public.riot_comp_games (
  player           text not null references public.riot_ids (player) on delete cascade,
  match_id         text not null,
  played_at        timestamptz not null,
  map              text,
  season           text,
  tier_id          int,
  tier             text,          -- rank after the game
  tier_before      text,
  rr               int,           -- RR in the rank after the game
  rr_change        int not null,  -- RR won (+) or lost (-) in this game
  elo              int,
  refunded_rr      int not null default 0,
  derank_protected boolean not null default false,
  placement        boolean not null default false,
  match_ms         bigint,
  fetched_at       timestamptz not null default now(),
  primary key (player, match_id)
);
create index if not exists riot_comp_games_when on public.riot_comp_games (played_at desc);
-- Each game's stat line (Nov 27 2026), from HenrikDev's stored matches (/valorant/v1/by-puuid/stored-matches, same match id)
alter table public.riot_comp_games add column if not exists kills int;
alter table public.riot_comp_games add column if not exists deaths int;
alter table public.riot_comp_games add column if not exists assists int;
alter table public.riot_comp_games add column if not exists agent text;
alter table public.riot_comp_games add column if not exists combat_score int;   -- total; ACS = combat_score / rounds
alter table public.riot_comp_games add column if not exists rounds_won int;
alter table public.riot_comp_games add column if not exists rounds_lost int;

create table if not exists public.riot_comp_status (
  player     text primary key references public.riot_ids (player) on delete cascade,
  fetched_at timestamptz not null default now(),
  ok         boolean not null default true,
  error      text,
  tier       text,
  rr         int,
  elo        int
);

alter table public.riot_comp_games enable row level security;
alter table public.riot_comp_status enable row level security;
drop policy if exists "staff read comp games" on public.riot_comp_games;
create policy "staff read comp games" on public.riot_comp_games for select
  using (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch());
drop policy if exists "staff read comp status" on public.riot_comp_status;
create policy "staff read comp status" on public.riot_comp_status for select
  using (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch());

create or replace function public.fb_comp_fetch(p_limit int default 20, p_player text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  k text; r record; res extensions.http_response; j jsonb; h jsonb; url text; acct jsonb; v_puuid text; m jsonb; mine text;
  checked int := 0; added int := 0; errs int := 0; stopped text := null; latest jsonb; before int;
begin
  -- staff and site admins; the scheduled job runs without a user
  if auth.uid() is not null and not (public.is_freshbatch() or exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid())) then
    raise exception 'staff only';
  end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'henrik_api_key';
  if k is null then raise exception 'no_key'; end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '20000');
  for r in
    select i.player, i.region, i.riot_name, i.riot_tag, i.puuid
      from public.riot_ids i left join public.riot_comp_status s on s.player = i.player
     where i.riot_name is not null and i.riot_tag is not null and (p_player is null or i.player = p_player)
     order by s.fetched_at nulls first, i.player
     limit greatest(1, least(coalesce(p_limit, 20), 25))
  loop
    -- the scheduled job spaces its calls out (HenrikDev turns away a burst even under 30 a minute); the backend's small
    -- checks (a few players, inside the site's 8 second request limit) go straight through
    if checked + errs > 0 and coalesce(p_limit, 20) > 5 then perform pg_sleep(3); end if;
    -- by Riot's account id once we know it (it survives renames), else by Riot ID
    url := case when r.puuid is not null
      then 'https://api.henrikdev.xyz/valorant/v2/by-puuid/mmr-history/' || r.region || '/pc/' || r.puuid
      else 'https://api.henrikdev.xyz/valorant/v2/mmr-history/' || r.region || '/pc/' || extensions.urlencode(r.riot_name) || '/' || extensions.urlencode(r.riot_tag) end;
    begin
      res := extensions.http(('GET', url, array[extensions.http_header('Authorization', k)], null, null)::extensions.http_request);
    exception when others then
      insert into public.riot_comp_status (player, fetched_at, ok, error) values (r.player, now(), false, 'HenrikDev didn''t answer')
        on conflict (player) do update set fetched_at = now(), ok = false, error = excluded.error;
      errs := errs + 1; continue;
    end;
    checked := checked + 1;
    if res.status = 429 then stopped := 'HenrikDev rate limit: try again in a minute'; exit; end if;
    if res.status <> 200 then
      insert into public.riot_comp_status (player, fetched_at, ok, error)
        values (r.player, now(), false, case when res.status = 404 then 'Riot ID not found' else 'HenrikDev error ' || res.status end)
        on conflict (player) do update set fetched_at = now(), ok = false, error = excluded.error;
      errs := errs + 1; continue;
    end if;
    j := res.content::jsonb -> 'data';
    acct := j -> 'account';
    -- remember the account id; a renamed account (found by its id) gets its new Riot ID saved
    if r.puuid is null and acct ->> 'puuid' is not null then
      update public.riot_ids set puuid = acct ->> 'puuid', updated_at = now()
       where player = r.player and not exists (select 1 from public.riot_ids x where x.puuid = acct ->> 'puuid');
    elsif r.puuid is not null and coalesce(acct ->> 'name', '') <> '' and coalesce(acct ->> 'tag', '') <> ''
          and (acct ->> 'name' <> r.riot_name or acct ->> 'tag' <> r.riot_tag) then
      update public.riot_ids set riot_name = acct ->> 'name', riot_tag = acct ->> 'tag', updated_at = now() where player = r.player;
    end if;
    select count(*) into before from public.riot_comp_games where player = r.player;
    for h in select * from jsonb_array_elements(coalesce(j -> 'history', '[]'::jsonb)) loop
      continue when coalesce(h ->> 'match_id', '') = '' or (h ->> 'date') is null;
      insert into public.riot_comp_games (player, match_id, played_at, map, season, tier_id, tier, tier_before, rr, rr_change, elo,
                                          refunded_rr, derank_protected, placement, match_ms)
      values (r.player, h ->> 'match_id', (h ->> 'date')::timestamptz, h -> 'map' ->> 'name', h -> 'season' ->> 'short',
              (h -> 'tier' ->> 'id')::int, h -> 'tier' ->> 'name', h -> 'tier_before_update' ->> 'name', (h ->> 'rr')::int,
              coalesce((h ->> 'last_change')::int, 0), (h ->> 'elo')::int, coalesce((h ->> 'refunded_rr')::int, 0),
              coalesce((h ->> 'was_derank_protected')::boolean, false), coalesce((h ->> 'is_placement_match')::boolean, false),
              (h ->> 'match_length')::bigint)
      on conflict (player, match_id) do update
        set rr_change = excluded.rr_change, rr = excluded.rr, tier = excluded.tier, tier_id = excluded.tier_id, elo = excluded.elo,
            refunded_rr = excluded.refunded_rr, derank_protected = excluded.derank_protected, fetched_at = now();
    end loop;
    added := added + (select count(*) from public.riot_comp_games where player = r.player) - before;
    -- the same games' stat lines (kills, deaths, assists, agent, score): one more call, matched by match id
    v_puuid := coalesce(r.puuid, acct ->> 'puuid');
    if v_puuid is not null and exists (select 1 from public.riot_comp_games g where g.player = r.player and g.kills is null) then
      if coalesce(p_limit, 20) > 5 then perform pg_sleep(3); end if;
      begin
        res := extensions.http(('GET', 'https://api.henrikdev.xyz/valorant/v1/by-puuid/stored-matches/' || r.region || '/' || v_puuid || '?mode=competitive&size=20',
                                array[extensions.http_header('Authorization', k)], null, null)::extensions.http_request);
      exception when others then res := null;
      end;
      if res.status = 429 then stopped := 'HenrikDev rate limit: try again in a minute'; end if;
      if res.status = 200 then
        for m in select * from jsonb_array_elements(coalesce(res.content::jsonb -> 'data', '[]'::jsonb)) loop
          mine := lower(m -> 'stats' ->> 'team');
          update public.riot_comp_games g
             set kills = (m -> 'stats' ->> 'kills')::int, deaths = (m -> 'stats' ->> 'deaths')::int, assists = (m -> 'stats' ->> 'assists')::int,
                 agent = m -> 'stats' -> 'character' ->> 'name', combat_score = (m -> 'stats' ->> 'score')::int,
                 rounds_won = (m -> 'teams' ->> mine)::int,
                 rounds_lost = (m -> 'teams' ->> case when mine = 'red' then 'blue' else 'red' end)::int
           where g.player = r.player and g.match_id = m -> 'meta' ->> 'id';
        end loop;
      end if;
    end if;
    latest := (select x from jsonb_array_elements(coalesce(j -> 'history', '[]'::jsonb)) x order by (x ->> 'date')::timestamptz desc limit 1);
    insert into public.riot_comp_status (player, fetched_at, ok, error, tier, rr, elo)
      values (r.player, now(), true, null, latest -> 'tier' ->> 'name', (latest ->> 'rr')::int, (latest ->> 'elo')::int)
      on conflict (player) do update set fetched_at = now(), ok = true, error = null,
        tier = coalesce(excluded.tier, riot_comp_status.tier), rr = coalesce(excluded.rr, riot_comp_status.rr), elo = coalesce(excluded.elo, riot_comp_status.elo);
    exit when stopped is not null;
  end loop;
  return jsonb_build_object('checked', checked, 'new_games', added, 'errors', errs, 'stopped', stopped,
    'never_checked', (select count(*) from public.riot_ids i where i.riot_name is not null and not exists (select 1 from public.riot_comp_status s where s.player = i.player)));
end $$;
revoke all on function public.fb_comp_fetch(int, text) from public, anon;
grant execute on function public.fb_comp_fetch(int, text) to authenticated;

-- Every 10 minutes, the 15 players checked longest ago (about every 1.5 hours each), calls 3 s apart: up to 30 calls,
-- about 20 a minute, which leaves room for the backend's checks inside HenrikDev's limit.
select cron.unschedule(jobid) from cron.job where jobname = 'pcmt-comp-games';
select cron.schedule('pcmt-comp-games', '*/10 * * * *', 'select public.fb_comp_fetch(15)');
