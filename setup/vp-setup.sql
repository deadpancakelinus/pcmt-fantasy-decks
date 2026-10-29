-- PCMT Fantasy Decks: VP (weekly reward points) and 4K/5K entry.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once.
--
-- How VP works:
--   * Each gameweek, every card in the deck that counted for you (the deck locked in before the gameweek
--     locked, with the same transfer rules as the leaderboard) earns its card number: that player's points
--     for the gameweek. No IGL bonus. A card below zero counts as 0, so VP never goes down from scoring.
--   * VP is paid when the gameweek ends (Monday 5:00 AM EDT, when the card numbers go back to zero).
--   * A result that arrives after the payout tops the payout up. A payout is never taken back.
--   * Supabase checks the live site's data.js and players.js every hour and pays whatever is due.
--     Nothing in the browser can add VP.

-- ===================== 1) The VP ledger =====================
-- One line per VP change. The Bank (a player's VP) is the sum of their lines.
--   kind 'week': gameweek payout, positive, week = the gameweek's Monday.
--   kind 'pack': VP spent on a card pack, negative, detail = {"pack": "<pack name>"}.
create table if not exists public.vp_ledger (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,                 -- 'week' = gameweek payout, 'pack' = card pack bought
  week date,                          -- the gameweek's Monday (for 'week' lines)
  amount integer not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists vp_ledger_user on public.vp_ledger (user_id, created_at);
alter table public.vp_ledger drop constraint if exists vp_ledger_kind_ok;
alter table public.vp_ledger add constraint vp_ledger_kind_ok check ((kind = 'week' and amount > 0) or (kind = 'pack' and amount < 0));
alter table public.vp_ledger enable row level security;
drop policy if exists "read own vp" on public.vp_ledger;
create policy "read own vp" on public.vp_ledger for select using (auth.uid() = user_id);
-- No insert/update/delete policies: only the payout job below can write VP.

-- ===================== 4Ks and 5Ks =====================
-- Admins can enter each player's 4Ks and 5Ks per series on admin.html. Everyone can read them (they're part of the scores).
-- series = "<start>|<team a>|<team b>" exactly as in data.js, e.g. "2026-10-24T00:00:00Z|T1|NAVI".
create table if not exists public.pcmt_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.pcmt_admins enable row level security;
drop policy if exists "see own admin row" on public.pcmt_admins;
create policy "see own admin row" on public.pcmt_admins for select using (auth.uid() = user_id);
-- To make someone an admin, run (their account id is shown on admin.html):
--   insert into public.pcmt_admins (user_id) values ('<account id>') on conflict do nothing;

-- PCMT Team staff (the people who run the site): they use backend.html. Add someone with
--   insert into public.freshbatch_staff (user_id) values ('<account id>') on conflict do nothing;
create table if not exists public.freshbatch_staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.freshbatch_staff enable row level security;
drop policy if exists "see own staff row" on public.freshbatch_staff;
create policy "see own staff row" on public.freshbatch_staff for select using (auth.uid() = user_id);
create or replace function public.is_freshbatch() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.freshbatch_staff where user_id = auth.uid());
$$;
grant execute on function public.is_freshbatch() to anon, authenticated;

create table if not exists public.multikills (
  series text not null,
  player text not null,
  k4 integer not null default 0 check (k4 between 0 and 30),
  k5 integer not null default 0 check (k5 between 0 and 30),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (series, player)
);
alter table public.multikills enable row level security;
drop policy if exists "anyone can read multikills" on public.multikills;
create policy "anyone can read multikills" on public.multikills for select using (true);
drop policy if exists "admins add multikills" on public.multikills;
create policy "admins add multikills" on public.multikills for insert
  with check (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch());
drop policy if exists "admins change multikills" on public.multikills;
create policy "admins change multikills" on public.multikills for update
  using (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch())
  with check (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch());

create table if not exists public.vp_sync_log (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  message text not null
);
alter table public.vp_sync_log enable row level security; -- private

-- ===================== 2) Rules, copied from the site's league.js =====================
create or replace function public.vp_ts(t text) returns timestamptz
language plpgsql immutable as $$
begin
  return t::timestamptz;
exception when others then
  return null;
end $$;

create or replace function public.vp_num(t text) returns numeric
language plpgsql immutable as $$
begin
  return coalesce(t::numeric, 0);
exception when others then
  return 0;
end $$;

-- Gameweeks (Oct 29 2026): Thursday 09:00 UTC (5:00 AM EDT) to the next Thursday. Before that they ran Monday to
-- Monday; the short week Mon Oct 26 - Thu Oct 29 bridges the two. Same as weekStart() on the site.
create or replace function public.vp_week_start(t timestamptz) returns timestamptz
language plpgsql immutable as $$
declare local_ts timestamp; d date; b timestamptz;
begin
  if t >= timestamptz '2026-10-26 09:00+00' and t < timestamptz '2026-10-29 09:00+00' then return timestamptz '2026-10-26 09:00+00'; end if;
  local_ts := (t at time zone 'UTC') - interval '4 hours';
  if t >= timestamptz '2026-10-29 09:00+00' then
    d := local_ts::date - ((extract(dow from local_ts)::int + 3) % 7);   -- back to Thursday
  else
    d := local_ts::date - (extract(isodow from local_ts)::int - 1);      -- back to Monday
  end if;
  b := (d + time '09:00') at time zone 'UTC';
  if b > t then b := b - interval '7 days'; end if;
  return b;
end $$;

create or replace function public.vp_week_end(b timestamptz) returns timestamptz
language sql immutable as $$ select public.vp_week_start(b + interval '7 days') $$;

-- When a gameweek's decks lock: Thursday morning (its start), unless its first game is on Saturday or later (New York
-- calendar day), then 6 hours before that game. Weeks before the Thursday switch locked 6 hours before their first game.
create or replace function public.vp_week_lock(b timestamptz, first_t timestamptz) returns timestamptz
language sql immutable as $$
  select case
    when b < timestamptz '2026-10-29 09:00+00' then first_t - interval '6 hours'
    when (first_t at time zone 'America/New_York')::date - (b at time zone 'America/New_York')::date >= 2 then first_t - interval '6 hours'
    else b end
$$;

create or replace function public.vp_role(r text) returns text
language sql immutable as $$
  select case when split_part(coalesce(r, ''), '/', 1) = 'yoru' then 'duelist' else split_part(coalesce(r, ''), '/', 1) end;
$$;

-- A deck counts only if it follows every rule (same as validDeck() on the site).
create or replace function public.vp_valid_deck(p_slots jsonb, p_players jsonb, p_twin jsonb) returns boolean
language plpgsql immutable as $$
declare k text; id text; p jsonb; seen jsonb := '{}'::jsonb; teams jsonb := '{}'::jsonb; cost numeric := 0; m text[]; n int;
begin
  if p_slots is null or jsonb_typeof(p_slots) <> 'object' then return false; end if;
  select count(*) into n from jsonb_object_keys(p_slots);
  if n <> 11 then return false; end if;
  for k, id in select key, value #>> '{}' from jsonb_each(p_slots) loop
    p := p_players -> id;
    if p is null or seen ? id or (p_twin ? id and seen ? (p_twin ->> id)) then return false; end if;
    seen := seen || jsonb_build_object(id, true);
    m := regexp_match(k, '^(duelist|controller|initiator|sentinel)-(1|2)$');
    if m is not null then
      if public.vp_role(p ->> 'role') <> m[1] then return false; end if;
    elsif k !~ '^wild-(1|2|3)$' then
      return false;
    end if;
    cost := cost + (p ->> 'price')::numeric;
    teams := teams || jsonb_build_object(p ->> 'team', coalesce((teams ->> (p ->> 'team'))::int, 0) + 1);
    if (teams ->> (p ->> 'team'))::int > 2 then return false; end if;
  end loop;
  return cost <= 100.000000001;
end $$;

-- Player prices as they were at time p_t: players.js prices, with any change made on backend.html before then
-- (public.player_price_changes; a null price means back to the players.js price). A deck is checked against
-- the prices from when it was saved, so a later price change never breaks a deck that was within budget.
create or replace function public.vp_players_at(p_players jsonb, p_t timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ch jsonb;
begin
  if to_regclass('public.player_price_changes') is null then return p_players; end if;
  select jsonb_object_agg(player, case when price is null then p_players -> player else (p_players -> player) || jsonb_build_object('price', price) end)
    into ch
    from (select distinct on (player) player, price from public.player_price_changes
          where changed_at <= p_t and p_players ? player order by player, changed_at desc, id desc) q;
  return p_players || coalesce(ch, '{}'::jsonb);
end $$;

create or replace function public.vp_transfers(p_prev jsonb, p_slots jsonb) returns int
language sql immutable as $$
  select count(*)::int from jsonb_each_text(p_slots) s
  where p_prev is not null and not exists (select 1 from jsonb_each_text(p_prev) q where q.value = s.value);
$$;

-- Works out every manager's VP for each finished gameweek and pays anything still owed.
-- p_pay = false only reports (used for checking); it never writes.
-- One series' points per player, same as seriesPoints() in league.js (and the Guide).
-- r.stats -> id = [K, D, A, FK, ACS, KAST, ADR, RT]; r.maps = [{ map, a, b, k: { id: kills } }]; r.multi -> id = [4K, 5K].
create or replace function public.vp_series_points(r jsonb, p_players jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  st jsonb := coalesce(r -> 'stats', '{}'::jsonb);
  maps jsonb := case when jsonb_typeof(r -> 'maps') = 'array' then r -> 'maps' else '[]'::jsonb end;
  mk jsonb := case when public.vp_ts(r ->> 'start') >= timestamptz '2026-10-19 09:00:00+00' and jsonb_typeof(r -> 'multi') = 'object'
                   then r -> 'multi' else '{}'::jsonb end;
  top_acs numeric; top_kast numeric; won_a int := 0; won_b int := 0; series_bonus numeric := 0;
  x record; m jsonb; side text; pts numeric; mine numeric; theirs numeric; diff numeric; mk_k text; c jsonb; out jsonb := '{}'::jsonb;
begin
  select max(public.vp_num(q.v ->> 4)), max(public.vp_num(q.v ->> 5)) into top_acs, top_kast from jsonb_each(st) q(k, v);
  for m in select e from jsonb_array_elements(maps) e loop
    if public.vp_num(m ->> 'a') > public.vp_num(m ->> 'b') then won_a := won_a + 1;
    elsif public.vp_num(m ->> 'b') > public.vp_num(m ->> 'a') then won_b := won_b + 1; end if;
  end loop;
  -- series score bonus for the winners: 2-0 +2, 3-0 +3, 3-1 +1
  series_bonus := case case when r ->> 'winner' = r ->> 'a' then won_a || '-' || won_b when r ->> 'winner' = r ->> 'b' then won_b || '-' || won_a end
                  when '2-0' then 2 when '3-0' then 3 when '3-1' then 1 else 0 end;
  for x in select q.k, q.v from jsonb_each(st) q(k, v) where p_players ? q.k loop
    side := case when p_players -> x.k ->> 'team' = r ->> 'a' then 'a' when p_players -> x.k ->> 'team' = r ->> 'b' then 'b' end;
    pts := public.vp_num(x.v ->> 0) * 1 + public.vp_num(x.v ->> 2) * 0.5 + public.vp_num(x.v ->> 3) * 0.5   -- kills, assists, first bloods (deaths don't score)
         + floor(public.vp_num(x.v ->> 6) / 50)                                                            -- +1 per 50 ADR
         + case when public.vp_num(x.v ->> 4) = top_acs then 2 else 0 end
         + case when public.vp_num(x.v ->> 5) = top_kast then 1 else 0 end;
    if coalesce(x.v ->> 7, '') <> '' then                                                                    -- Toxic rating places 1-3 (ties share)
      pts := pts + case (select count(*) from jsonb_each(st) q(k, v) where coalesce(q.v ->> 7, '') <> '' and public.vp_num(q.v ->> 7) > public.vp_num(x.v ->> 7))
                   when 0 then 3 when 1 then 2 when 2 then 1 else 0 end;
    end if;
    for m in select e from jsonb_array_elements(maps) e loop
      mk_k := m -> 'k' ->> x.k;
      if coalesce(mk_k, '') <> '' then
        pts := pts + floor(public.vp_num(mk_k) / 5) + case when public.vp_num(mk_k) = 0 then -5 else 0 end;   -- +1 per 5 kills on a map, 0 kills -5
      end if;
      if side is null then continue; end if;
      mine := public.vp_num(m ->> side); theirs := public.vp_num(m ->> case side when 'a' then 'b' else 'a' end); diff := mine - theirs;
      if diff > 0 then
        pts := pts + 1 + case when theirs = 0 then 7 when diff >= 10 then 2 when diff >= 4 then 1 else 0 end;   -- map win, 13-0, by 10-12, by 4-9
      elsif diff < 0 and mine = 0 then
        pts := pts - 5;                                                                                     -- 0-13
      end if;
    end loop;
    if side is not null and p_players -> x.k ->> 'team' = r ->> 'winner' then pts := pts + series_bonus; end if;
    c := mk -> x.k;
    if jsonb_typeof(c) = 'array' then
      pts := pts + public.vp_num(c ->> 0) * 1 + public.vp_num(c ->> 1) * 3;   -- 4K +1, 5K +3
    end if;
    out := out || jsonb_build_object(x.k, pts);
  end loop;
  return out;
end $$;

create or replace function public.vp_compute(p_matches jsonb, p_results jsonb, p_players jsonb, p_twin jsonb,
                                             p_now timestamptz default now(), p_pay boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
-- Each gameweek counts the manager's last valid deck saved before the week's lock (vp_week_lock); with none, the deck
-- from the week before counts again. When the week ends it pays each card's points (below zero counts as 0).
-- Same as scoreManager() / weekCardVP() in tools/league.js.
declare
  players jsonb; weekpts jsonb := '{}'::jsonb; r jsonb; rb text; sp record;
  w record; u uuid; d record; use_slots jsonb; use_name text; prev jsonb; owed int; paid int; cards jsonb;
  out jsonb := '[]'::jsonb; paid_lines int := 0; paid_total int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('pcmt-vp'));
  select coalesce(jsonb_object_agg(p ->> 'id', p), '{}'::jsonb) into players from jsonb_array_elements(coalesce(p_players, '[]')) p;
  p_twin := coalesce(p_twin, '{}'::jsonb);

  -- Card numbers: each player's points per gameweek (same as seriesPoints() on the site).
  for r in select x from jsonb_array_elements(coalesce(p_results, '[]')) x loop
    if public.vp_ts(r ->> 'start') is null then continue; end if;
    rb := to_char(public.vp_week_start(public.vp_ts(r ->> 'start')) at time zone 'UTC', 'YYYY-MM-DD');
    for sp in select q.k, q.v from jsonb_each(public.vp_series_points(r, players)) q(k, v) loop
      weekpts := jsonb_set(weekpts, array[rb], coalesce(weekpts -> rb, '{}'::jsonb), true);
      weekpts := jsonb_set(weekpts, array[rb, sp.k], to_jsonb(coalesce((weekpts -> rb ->> sp.k)::numeric, 0) + (sp.v #>> '{}')::numeric), true);
    end loop;
  end loop;

  create temp table if not exists vp_weeks (b timestamptz primary key, first_t timestamptz) on commit drop;
  truncate vp_weeks;
  insert into vp_weeks (b, first_t)
    select public.vp_week_start(t), min(t) from (
      select public.vp_ts(x ->> 'start') t from jsonb_array_elements(coalesce(p_matches, '[]') || coalesce(p_results, '[]')) x
    ) q where t is not null group by 1;

  for u in select distinct user_id from public.deck_history loop
    prev := null; use_name := null;
    for w in select b, public.vp_week_lock(b, first_t) as lock_at, public.vp_week_end(b) as e from vp_weeks order by b loop
      if p_now < w.lock_at then continue; end if;              -- gameweek not locked yet
      use_slots := null;
      for d in select slots, name, created_at from public.deck_history where user_id = u and created_at < w.lock_at order by created_at desc, id desc loop
        if public.vp_valid_deck(d.slots, public.vp_players_at(players, d.created_at), p_twin) then
          use_slots := d.slots; use_name := d.name; exit;
        end if;
      end loop;
      if use_slots is null then
        if prev is null then continue; end if;
        use_slots := prev;                                     -- no allowed new deck: the last one counts again
      end if;
      prev := use_slots;
      if p_now < w.e then continue; end if;                    -- paid when the gameweek ends
      rb := to_char(w.b at time zone 'UTC', 'YYYY-MM-DD');
      select coalesce(jsonb_object_agg(v, greatest(0, coalesce((weekpts -> rb ->> v)::numeric, 0))), '{}'::jsonb),
             round(coalesce(sum(greatest(0, coalesce((weekpts -> rb ->> v)::numeric, 0))), 0))::int   -- paid in whole Credits
        into cards, owed from (select distinct v from jsonb_each_text(use_slots) s(k, v)) q;
      select coalesce(sum(amount), 0)::int into paid from public.vp_ledger where user_id = u and kind = 'week' and week = rb::date;
      out := out || jsonb_build_array(jsonb_build_object('user', u, 'week', rb, 'owed', owed, 'paid_before', paid));
      if p_pay and owed > paid then
        insert into public.vp_ledger (user_id, kind, week, amount, detail)
          values (u, 'week', rb::date, owed - paid, jsonb_build_object('deck', coalesce(use_name, ''), 'cards', cards, 'topup', paid > 0));
        paid_lines := paid_lines + 1; paid_total := paid_total + (owed - paid);
      end if;
    end loop;
  end loop;
  return jsonb_build_object('payouts', paid_lines, 'vp', paid_total, 'weeks', out);
end $$;

-- Reads the two arrays straight out of the site's data.js / players.js text.
create or replace function public.vp_extract(p_js text, p_name text) returns jsonb
language plpgsql immutable as $$
declare s int; e int; head text := 'var ' || p_name || ' = '; closer text;
begin
  s := strpos(p_js, head);
  if s = 0 then raise exception '% not found', p_name; end if;
  s := s + length(head);
  closer := case substr(p_js, s, 1) when '[' then '];' when '{' then '};' else null end;
  if closer is null then raise exception '% is not an array or object', p_name; end if;
  e := strpos(substr(p_js, s), closer);
  if e = 0 then raise exception '% has no end', p_name; end if;
  return substr(p_js, s, e)::jsonb;
end $$;

create or replace function public.vp_ingest(p_data_js text, p_players_js text, p_now timestamptz default now(), p_pay boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare res jsonb; mk jsonb;
begin
  -- 4Ks and 5Ks from the backend, attached to each result as "multi": {"<player id>": [4Ks, 5Ks]}
  select coalesce(jsonb_object_agg(series, pl), '{}'::jsonb) into mk from (
    select series, jsonb_object_agg(player, jsonb_build_array(k4, k5)) pl from public.multikills where k4 > 0 or k5 > 0 group by series) q;
  select coalesce(jsonb_agg(x || jsonb_build_object('multi', coalesce(mk -> ((x ->> 'start') || '|' || (x ->> 'a') || '|' || (x ->> 'b')), '{}'::jsonb))), '[]'::jsonb)
    into res from jsonb_array_elements(public.vp_extract(p_data_js, 'PCMT_RESULTS')) x;
  return public.vp_compute(public.vp_extract(p_data_js, 'PCMT_MATCHES'), res,
                           public.vp_extract(p_players_js, 'PCMT_SITE_PLAYERS'), public.vp_extract(p_players_js, 'PCMT_SITE_TWIN'),
                           p_now, p_pay);
end $$;

-- The hourly job: fetch the live files and pay whatever is due.
create or replace function public.vp_sync() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare st_d int; st_p int; data_js text; players_js text; res jsonb; msg text; bust text := extract(epoch from now())::bigint::text;
begin
  select status, content into st_d, data_js from extensions.http_get('https://fantasy.pcmt.gg/data.js?v=' || bust);
  select status, content into st_p, players_js from extensions.http_get('https://fantasy.pcmt.gg/players.js?v=' || bust);
  if st_d <> 200 or st_p <> 200 then raise exception 'site files not reachable (data.js %, players.js %)', st_d, st_p; end if;
  res := public.vp_ingest(data_js, players_js, now(), true);
  msg := format('ok: %s payout(s), %s VP', res ->> 'payouts', res ->> 'vp');
  insert into public.vp_sync_log (ok, message) values (true, msg);
  delete from public.vp_sync_log where ran_at < now() - interval '30 days';
  return msg;
exception when others then
  insert into public.vp_sync_log (ok, message) values (false, sqlerrm);
  return 'failed: ' || sqlerrm;
end $$;

revoke all on function public.vp_compute(jsonb, jsonb, jsonb, jsonb, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.vp_ingest(text, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.vp_sync() from public, anon, authenticated;

-- [supabase-only] ===================== 3) Hourly payout job =====================
create extension if not exists http with schema extensions;
create extension if not exists pg_cron;
select cron.schedule('pcmt-vp-payout', '7 * * * *', 'select public.vp_sync()');
-- Run once now to check it works. It should say "ok: 0 payout(s), 0 VP" until the first gameweek ends.
select public.vp_sync();
