-- PCMT Fantasy Decks: Pick'ems (pickems.html).
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once.
-- Needs setup/vp-setup.sql (staff list, Credits ledger, vp_extract) first.
--
--   * The brackets live in pickems.js on the site. pickem_sync() fetches it every hour (minute 37), keeps a copy
--     in pickem_state, and pays Credits for every finished series.
--   * A pick is the series winner (no score). The whole bracket locks 6 hours before the next game (pickem_events.lock_at,
--     saved the first time it applies) and stays locked to the end. Picks are saved together with save_bracket(); everyone reads only their own.
--   * pickem_events: one row per bracket. open = false keeps it to PCMT Team staff and site admins.
--     credits_win = Credits for the right winner. credits_exact (extra for an exact score) is 0: picks have no score.
--       update public.pickem_events set open = true where id = 'emea-s2';            -- open it to everyone
--       update public.pickem_events set credits_win = 20 where id = 'emea-s2';

-- ===================== Tables =====================
create table if not exists public.pickem_events (
  id text primary key,
  open boolean not null default false,
  credits_win integer not null default 20 check (credits_win >= 0),
  credits_exact integer not null default 0 check (credits_exact >= 0)
);
alter table public.pickem_events enable row level security;
drop policy if exists "read pickem events" on public.pickem_events;
create policy "read pickem events" on public.pickem_events for select using (true);
insert into public.pickem_events (id) values ('emea-s2') on conflict do nothing;
alter table public.pickem_events alter column credits_exact set default 0;
update public.pickem_events set credits_exact = 0 where credits_exact <> 0;

create table if not exists public.pickem_state (
  event text primary key,
  data jsonb not null,
  synced_at timestamptz not null default now()
);
alter table public.pickem_state enable row level security;   -- no policies: only the functions below read it

create table if not exists public.pickem_picks (
  user_id uuid not null references auth.users (id) on delete cascade,
  event text not null,
  series integer not null,
  winner text not null,          -- team code
  win_maps integer,              -- old score picks (no longer used): the winner's maps
  lose_maps integer,             -- and the loser's maps
  updated_at timestamptz not null default now(),
  primary key (user_id, event, series)
);
alter table public.pickem_picks alter column win_maps drop not null;
alter table public.pickem_picks alter column lose_maps drop not null;
alter table public.pickem_picks enable row level security;
drop policy if exists "read own picks" on public.pickem_picks;
create policy "read own picks" on public.pickem_picks for select using (auth.uid() = user_id);

-- Credits ledger: 'pickem' lines are Pick'ems winnings (positive), detail = {event, series, label}.
alter table public.vp_ledger drop constraint if exists vp_ledger_kind_ok;
alter table public.vp_ledger add constraint vp_ledger_kind_ok check (
  (kind = 'week' and amount > 0) or (kind = 'pack' and amount < 0) or (kind = 'pickem' and amount > 0));
create unique index if not exists vp_ledger_pickem_once on public.vp_ledger (user_id, (detail ->> 'event'), (detail ->> 'series')) where kind = 'pickem';

-- ===================== Bracket =====================
-- Every series of one bracket with its real teams filled in where known:
-- [{n, round, bo, start, score, a, b (team codes or null), winner, loser, locked}]
create or replace function public.pickem_resolve(p_bracket jsonb, p_now timestamptz default now()) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  seeds jsonb := p_bracket -> 'seeds'; won jsonb := '{}'::jsonb; lost jsonb := '{}'::jsonb; out jsonb := '[]'::jsonb;
  s jsonb; ta text; tb text; w text; l text; pass int; changed boolean;
begin
  -- Results can point at later-numbered series' winners, so go round until nothing new is learned.
  for pass in 1 .. 20 loop
    changed := false;
    for s in select * from jsonb_array_elements(p_bracket -> 'series') loop
      if won ? (s ->> 'n') then continue; end if;
      ta := case when s ->> 'a' ~ '^W\d+$' then won ->> substr(s ->> 'a', 2) when s ->> 'a' ~ '^L\d+$' then lost ->> substr(s ->> 'a', 2) else seeds ->> (s ->> 'a') end;
      tb := case when s ->> 'b' ~ '^W\d+$' then won ->> substr(s ->> 'b', 2) when s ->> 'b' ~ '^L\d+$' then lost ->> substr(s ->> 'b', 2) else seeds ->> (s ->> 'b') end;
      if ta is not null and tb is not null and jsonb_typeof(s -> 'score') = 'array'
         and (s -> 'score' ->> 0)::int <> (s -> 'score' ->> 1)::int then
        if (s -> 'score' ->> 0)::int > (s -> 'score' ->> 1)::int then w := ta; l := tb; else w := tb; l := ta; end if;
        won := won || jsonb_build_object(s ->> 'n', w);
        lost := lost || jsonb_build_object(s ->> 'n', l);
        changed := true;
      end if;
    end loop;
    exit when not changed;
  end loop;
  for s in select * from jsonb_array_elements(p_bracket -> 'series') order by (value ->> 'n')::int loop
    ta := case when s ->> 'a' ~ '^W\d+$' then won ->> substr(s ->> 'a', 2) when s ->> 'a' ~ '^L\d+$' then lost ->> substr(s ->> 'a', 2) else seeds ->> (s ->> 'a') end;
    tb := case when s ->> 'b' ~ '^W\d+$' then won ->> substr(s ->> 'b', 2) when s ->> 'b' ~ '^L\d+$' then lost ->> substr(s ->> 'b', 2) else seeds ->> (s ->> 'b') end;
    out := out || jsonb_build_array(jsonb_build_object(
      'n', (s ->> 'n')::int, 'round', s ->> 'round', 'bo', coalesce((s ->> 'bo')::int, 3), 'start', s -> 'start', 'score', s -> 'score',
      'a', ta, 'b', tb, 'winner', won ->> (s ->> 'n'), 'loser', lost ->> (s ->> 'n'),
      'locked', (won ? (s ->> 'n')) or jsonb_typeof(s -> 'score') = 'array'
                or (jsonb_typeof(s -> 'start') = 'string' and (s ->> 'start')::timestamptz <= p_now)));
  end loop;
  return out;
end $$;


-- ===================== Lock 6 hours before the next game (Oct 25 2026) =====================
-- The whole bracket locks 6 hours before the earliest series that has a start time and no score yet, and stays locked
-- for good: the first time that moment is reached, it is saved in pickem_events.lock_at and never moves again.
-- While no unplayed series has a time, picks stay open.
create or replace function public.pickem_lock_time(p_bracket jsonb) returns timestamptz
language sql immutable set search_path = public as $$
  select min((s ->> 'start')::timestamptz) - interval '6 hours'
  from jsonb_array_elements(p_bracket -> 'series') s
  where jsonb_typeof(s -> 'start') = 'string' and jsonb_typeof(s -> 'score') <> 'array'
$$;
revoke all on function public.pickem_lock_time(jsonb) from public, anon, authenticated;

-- Saves lock_at for good once the lock time has come (called by the hourly sync and before every save).
create or replace function public.pickem_check_lock(p_event text) returns timestamptz
language plpgsql volatile security definer set search_path = public as $$
declare ev public.pickem_events; st jsonb; t timestamptz;
begin
  select * into ev from public.pickem_events where id = p_event for update;
  if not found or ev.lock_at is not null then return ev.lock_at; end if;
  select data into st from public.pickem_state where event = p_event;
  t := public.pickem_lock_time(st);
  if t is not null and now() >= t then
    update public.pickem_events set lock_at = t where id = p_event;
    return t;
  end if;
  return null;
end $$;
revoke all on function public.pickem_check_lock(text) from public, anon, authenticated;

-- ===================== Whole-bracket lock and save (Oct 24 2026) =====================
-- lock_at: every pick in the bracket locks at this time and stays locked to the end. Set by pickem_check_lock() (6 hours
-- before the next game); null = open.
alter table public.pickem_events add column if not exists lock_at timestamptz;

-- Saves your whole bracket at once: p_picks = {"<series n>": "<team code>", ...}. Replaces your earlier picks.
-- Each pick must be one of the two teams in that series, using the real results and your own earlier picks.
create or replace function public.save_bracket(p_event text, p_picks jsonb) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  u uuid := auth.uid(); ev public.pickem_events; st jsonb; x jsonb; won jsonb := '{}'::jsonb; lost jsonb := '{}'::jsonb;
  ref_a text; ref_b text; ta text; tb text; pk text; n int; saved int := 0;
begin
  if u is null then raise exception 'Log in with Discord to save your picks.'; end if;
  select * into ev from public.pickem_events where id = p_event;
  if not found then raise exception 'That bracket doesn''t exist.'; end if;
  if not ev.open and not public.is_freshbatch() and not exists (select 1 from public.pcmt_admins where user_id = u) then
    raise exception 'Pick''ems isn''t open yet.';
  end if;
  ev.lock_at := coalesce(ev.lock_at, public.pickem_check_lock(p_event));
  if ev.lock_at is not null and now() >= ev.lock_at then raise exception 'The bracket is locked until the end of the playoffs.'; end if;
  select data into st from public.pickem_state where event = p_event;
  if st is null then raise exception 'The bracket hasn''t loaded on the server yet. Try again in an hour.'; end if;
  if p_picks is null or jsonb_typeof(p_picks) <> 'object' then raise exception 'Nothing to save.'; end if;
  -- walk the series in order: the real teams where known, else the winners and losers of your own picks
  for x in select value from jsonb_array_elements(public.pickem_resolve(st)) order by (value ->> 'n')::int loop
    n := (x ->> 'n')::int;
    select s ->> 'a', s ->> 'b' into ref_a, ref_b from jsonb_array_elements(st -> 'series') s where (s ->> 'n')::int = n;
    ta := coalesce(x ->> 'a', case when ref_a ~ '^W\d+$' then won ->> substr(ref_a, 2) when ref_a ~ '^L\d+$' then lost ->> substr(ref_a, 2) end);
    tb := coalesce(x ->> 'b', case when ref_b ~ '^W\d+$' then won ->> substr(ref_b, 2) when ref_b ~ '^L\d+$' then lost ->> substr(ref_b, 2) end);
    if x ->> 'winner' is not null then
      won := won || jsonb_build_object(n::text, x ->> 'winner'); lost := lost || jsonb_build_object(n::text, x ->> 'loser');
      if p_picks ? n::text then raise exception 'Series % is already played.', n; end if;
      continue;
    end if;
    pk := p_picks ->> n::text;
    if pk is null then continue; end if;
    if pk is distinct from ta and pk is distinct from tb then raise exception 'Your pick for series % isn''t one of its teams. Check the bracket and save again.', n; end if;
    won := won || jsonb_build_object(n::text, pk);
    if ta is not null and tb is not null then lost := lost || jsonb_build_object(n::text, case when pk = ta then tb else ta end); end if;
  end loop;
  if exists (select 1 from jsonb_object_keys(p_picks) k where k !~ '^\d+$' or not exists (
      select 1 from jsonb_array_elements(st -> 'series') s where (s ->> 'n') = k)) then
    raise exception 'That series isn''t in the bracket.';
  end if;
  delete from public.pickem_picks where user_id = u and event = p_event;
  insert into public.pickem_picks (user_id, event, series, winner, updated_at)
    select u, p_event, k::int, p_picks ->> k, now() from jsonb_object_keys(p_picks) k;
  get diagnostics saved = row_count;
  return saved;
end $$;
revoke all on function public.save_bracket(text, jsonb) from public, anon;
grant execute on function public.save_bracket(text, jsonb) to authenticated;

-- One pick at a time (older pages): same bracket lock.
create or replace function public.save_pick(p_event text, p_series integer, p_winner text, p_win integer, p_lose integer)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare u uuid := auth.uid(); ev public.pickem_events; st jsonb; s jsonb; teams jsonb;
begin
  if u is null then raise exception 'Log in with Discord to make picks.'; end if;
  select * into ev from public.pickem_events where id = p_event;
  if not found then raise exception 'That bracket doesn''t exist.'; end if;
  if not ev.open and not public.is_freshbatch() and not exists (select 1 from public.pcmt_admins where user_id = u) then
    raise exception 'Pick''ems isn''t open yet.';
  end if;
  ev.lock_at := coalesce(ev.lock_at, public.pickem_check_lock(p_event));
  if ev.lock_at is not null and now() >= ev.lock_at then raise exception 'The bracket is locked until the end of the playoffs.'; end if;
  select data into st from public.pickem_state where event = p_event;
  if st is null then raise exception 'The bracket hasn''t loaded on the server yet. Try again in an hour.'; end if;
  select x into s from jsonb_array_elements(public.pickem_resolve(st)) x where (x ->> 'n')::int = p_series;
  if s is null then raise exception 'That series isn''t in the bracket.'; end if;
  if (s ->> 'locked')::boolean then raise exception 'That series has started, so its pick is locked.'; end if;
  if p_winner is null then
    delete from public.pickem_picks where user_id = u and event = p_event and series = p_series;
    return false;
  end if;
  select jsonb_agg(value) into teams from jsonb_each_text(st -> 'seeds');
  if not teams ? p_winner then raise exception 'That team isn''t in this bracket.'; end if;
  if s ->> 'a' is not null and s ->> 'b' is not null and p_winner not in (s ->> 'a', s ->> 'b') then
    raise exception 'That team isn''t playing in this series.';
  end if;
  insert into public.pickem_picks (user_id, event, series, winner, win_maps, lose_maps, updated_at)
    values (u, p_event, p_series, p_winner, null, null, now())
    on conflict (user_id, event, series) do update set winner = excluded.winner, win_maps = null, lose_maps = null, updated_at = now();
  return true;
end $$;
revoke all on function public.save_pick(text, integer, text, integer, integer) from public, anon;
grant execute on function public.save_pick(text, integer, text, integer, integer) to authenticated;

-- ===================== Standings =====================
-- Points per manager from finished series: 1 for the right winner (exact stays 0: picks have no score).
create or replace function public.pickem_standings(p_event text)
returns table (user_id uuid, name text, points integer, correct integer, exact integer, picked integer)
language sql stable security definer set search_path = public as $$
  with r as (
    select (x ->> 'n')::int n, x ->> 'winner' winner, greatest((x -> 'score' ->> 0)::int, (x -> 'score' ->> 1)::int) wm,
           least((x -> 'score' ->> 0)::int, (x -> 'score' ->> 1)::int) lm
    from public.pickem_state st, jsonb_array_elements(public.pickem_resolve(st.data)) x
    where st.event = p_event and x ->> 'winner' is not null)
  select p.user_id, coalesce(pr.name, 'Manager'),
         (count(*) filter (where p.winner = r.winner) + count(*) filter (where p.winner = r.winner and p.win_maps = r.wm and p.lose_maps = r.lm))::int,
         count(*) filter (where p.winner = r.winner)::int,
         count(*) filter (where p.winner = r.winner and p.win_maps = r.wm and p.lose_maps = r.lm)::int,
         count(*)::int
  from public.pickem_picks p join r on r.n = p.series
  left join public.profiles pr on pr.id = p.user_id
  where p.event = p_event
  group by p.user_id, pr.name
$$;
revoke all on function public.pickem_standings(text) from public;
grant execute on function public.pickem_standings(text) to anon, authenticated;

-- ===================== Sync and payout =====================
create or replace function public.pickem_ingest(p_js text, p_now timestamptz default now()) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare b jsonb; ev public.pickem_events; x jsonb; p public.pickem_picks; amt int; wm int; lm int; paid int := 0; total int := 0; n int;
begin
  for b in select * from jsonb_array_elements(public.vp_extract(p_js, 'PCMT_PICKEMS')) loop
    insert into public.pickem_state (event, data, synced_at) values (b ->> 'id', b, p_now)
      on conflict (event) do update set data = excluded.data, synced_at = excluded.synced_at;
    insert into public.pickem_events (id) values (b ->> 'id') on conflict do nothing;
    perform public.pickem_check_lock(b ->> 'id');
    select * into ev from public.pickem_events where id = b ->> 'id';
    for x in select * from jsonb_array_elements(public.pickem_resolve(b, p_now)) loop
      if x ->> 'winner' is null then continue; end if;
      n := (x ->> 'n')::int;
      wm := greatest((x -> 'score' ->> 0)::int, (x -> 'score' ->> 1)::int);
      lm := least((x -> 'score' ->> 0)::int, (x -> 'score' ->> 1)::int);
      for p in select * from public.pickem_picks where event = ev.id and series = n and winner = x ->> 'winner' loop
        amt := ev.credits_win + case when p.win_maps = wm and p.lose_maps = lm then ev.credits_exact else 0 end;
        if amt <= 0 then continue; end if;
        insert into public.vp_ledger (user_id, kind, amount, detail, created_at)
          values (p.user_id, 'pickem', amt, jsonb_build_object('event', ev.id, 'series', n::text, 'name', b ->> 'name',
                  'label', (x ->> 'round') || ': ' || (x ->> 'a') || ' vs ' || (x ->> 'b'), 'exact', p.win_maps = wm and p.lose_maps = lm), p_now)
          on conflict do nothing;
        if found then paid := paid + 1; total := total + amt; end if;
      end loop;
    end loop;
  end loop;
  return jsonb_build_object('payouts', paid, 'credits', total);
end $$;

create or replace function public.pickem_sync() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare st int; js text; res jsonb; msg text;
begin
  select status, content into st, js from extensions.http_get('https://fantasy.pcmt.gg/pickems.js?v=' || extract(epoch from now())::bigint::text);
  if st <> 200 then raise exception 'pickems.js not reachable (%)', st; end if;
  res := public.pickem_ingest(js, now());
  msg := format('pickems ok: %s payout(s), %s Credits', res ->> 'payouts', res ->> 'credits');
  insert into public.vp_sync_log (ok, message) values (true, msg);
  return msg;
exception when others then
  insert into public.vp_sync_log (ok, message) values (false, 'pickems: ' || sqlerrm);
  return 'failed: ' || sqlerrm;
end $$;

revoke all on function public.pickem_resolve(jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.pickem_ingest(text, timestamptz) from public, anon, authenticated;
revoke all on function public.pickem_sync() from public, anon, authenticated;

-- [supabase-only] ===================== Hourly job =====================
select cron.schedule('pcmt-pickems', '37 * * * *', 'select public.pickem_sync()');
-- Run once now. It fails until pickems.js is on the live site.
select public.pickem_sync();
