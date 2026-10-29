-- PCMT Fantasy Decks: Thursday-to-Thursday gameweeks and the new deck lock (Oct 29 2026).
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once. (Also in setup/vp-setup.sql.)
--   * Gameweeks run Thursday 09:00 UTC to the next Thursday (Monday weeks before; Mon Oct 26 - Thu Oct 29 bridges them).
--   * Decks lock Thursday morning, or 6 hours before the first game if it's on Saturday or later.
--   * Each week counts the deck saved before its lock and pays when the week ends.

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
revoke all on function public.vp_compute(jsonb, jsonb, jsonb, jsonb, timestamptz, boolean) from public, anon, authenticated;

-- Check: lock_fn should be true and week_start_now a Thursday (2026-10-29 or later).
select to_regprocedure('public.vp_week_lock(timestamptz,timestamptz)') is not null as lock_fn, public.vp_week_start(now()) as week_start_now;
