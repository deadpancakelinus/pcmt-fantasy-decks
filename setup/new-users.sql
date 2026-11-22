-- New users (Nov 22 2026): anyone whose account was made after the NA Stage 1 deck lock gets their own NA lock, 5 days
-- after they signed up. Their NA deck stays open until then, and the last valid NA deck saved before it counts for the
-- whole stage like everyone else's (best two series, every stage series counts). Everyone else keeps the stage lock.
-- Same as stageLockFor() in tools/league.js and pcmtMyStageLock() in the Main board. Paste into the Supabase SQL editor
-- after two-decks.sql (safe to run again).

-- The NA stage lock for one player: 5 days after sign-up for accounts made after the stage lock, else the stage lock.
create or replace function public.vp_user_stage_lock(p_user uuid, p_stage_lock timestamptz)
returns timestamptz language sql stable security definer set search_path to 'public' as $$
  select coalesce((select greatest(p_stage_lock, u.created_at + interval '5 days') from auth.users u
                   where u.id = p_user and u.created_at >= p_stage_lock), p_stage_lock);
$$;
revoke all on function public.vp_user_stage_lock(uuid, timestamptz) from public, anon, authenticated;

-- Every account made after the stage lock, with its own lock (the site scores and shows their decks with it).
-- Only the user id and the lock time are returned.
create or replace function public.pcmt_late_locks()
returns table (user_id uuid, lock_at timestamptz) language sql stable security definer set search_path to 'public' as $$
  select u.id, u.created_at + interval '5 days' from auth.users u, public.vp_na_stage() st
  where st.lock_at is not null and u.created_at >= st.lock_at and (st.ends_at is null or u.created_at < st.ends_at);
$$;
revoke all on function public.pcmt_late_locks() from public;
grant execute on function public.pcmt_late_locks() to anon, authenticated;

create or replace function public.vp_compute(p_matches jsonb, p_results jsonb, p_players jsonb, p_twin jsonb, p_now timestamptz default now(), p_pay boolean default true)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  players jsonb; weekpts jsonb := '{"NA":{},"EMEA":{}}'::jsonb; r jsonb; rb text; rg text; sp record; st record;
  w record; u uuid; d record; use_slots jsonb; use_name text; prev jsonb; owed int; paid int; q record;
  stage_slots jsonb; stage_name text; regular boolean; in_stage boolean; ulock timestamptz;
  out jsonb := '[]'::jsonb; paid_lines int := 0; paid_total int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('pcmt-vp'));
  select * into st from public.vp_na_stage();
  select coalesce(jsonb_object_agg(p ->> 'id', p), '{}'::jsonb) into players from jsonb_array_elements(coalesce(p_players, '[]')) p;
  p_twin := coalesce(p_twin, '{}'::jsonb);
  create temp table if not exists vp_stage (player text, t timestamptz, pts numeric) on commit drop;
  truncate vp_stage;
  for r in select x from jsonb_array_elements(coalesce(p_results, '[]')) x loop
    if public.vp_ts(r ->> 'start') is null then continue; end if;
    if public.vp_in_na_stage(r) then
      insert into vp_stage select q2.k, public.vp_ts(r ->> 'start'), (q2.v #>> '{}')::numeric from jsonb_each(public.vp_series_points(r, players)) q2(k, v);
      continue;
    end if;
    rg := case when r ->> 'region' = 'EMEA' then 'EMEA' else 'NA' end;
    rb := to_char(public.vp_week_start(public.vp_ts(r ->> 'start')) at time zone 'UTC', 'YYYY-MM-DD');
    for sp in select q2.k, q2.v from jsonb_each(public.vp_series_points(r, players)) q2(k, v) loop
      weekpts := jsonb_set(weekpts, array[rg, rb], coalesce(weekpts -> rg -> rb, '{}'::jsonb), true);
      weekpts := jsonb_set(weekpts, array[rg, rb, sp.k], to_jsonb(coalesce((weekpts -> rg -> rb ->> sp.k)::numeric, 0) + (sp.v #>> '{}')::numeric), true);
    end loop;
  end loop;
  create temp table if not exists vp_weeks (b timestamptz primary key, first_t timestamptz) on commit drop;
  truncate vp_weeks;
  insert into vp_weeks (b, first_t)
    select public.vp_week_start(t), min(t) from (
      select public.vp_ts(x ->> 'start') t from jsonb_array_elements(coalesce(p_matches, '[]') || coalesce(p_results, '[]')) x
    ) q2 where t is not null group by 1;
  -- What each player's best-two stage total grew by in each gameweek.
  create temp table if not exists vp_stage_delta (b timestamptz, player text, d numeric) on commit drop;
  truncate vp_stage_delta;
  insert into vp_stage_delta
    select wk.b, coalesce(z.player, a.player), coalesce(z.s, 0) - coalesce(a.s, 0)
    from vp_weeks wk
    cross join lateral (select player, sum(pts) s from (select player, pts, row_number() over (partition by player order by pts desc) rn
                         from vp_stage where t < public.vp_week_end(wk.b)) q3 where rn <= 2 group by player) z
    left join lateral (select player, sum(pts) s from (select player, pts, row_number() over (partition by player order by pts desc) rn
                         from vp_stage where t < wk.b) q3 where rn <= 2 group by player) a on a.player = z.player;
  -- Each player's cards per finished gameweek, per region deck.
  create temp table if not exists vp_owed (u uuid, rb text, region text, pts numeric, cards jsonb, name text) on commit drop;
  truncate vp_owed;
  for u in select distinct user_id from public.deck_history loop
    foreach rg in array array['NA', 'EMEA'] loop
      prev := null; use_name := null; stage_slots := null; stage_name := null;
      if rg = 'NA' then
        ulock := public.vp_user_stage_lock(u, st.lock_at);
        for d in select slots, name, created_at from public.deck_history where user_id = u and created_at < ulock and (region = rg or region is null) order by created_at desc, id desc loop
          if public.vp_valid_deck(d.slots, public.vp_players_at(players, d.created_at), p_twin) then
            stage_slots := d.slots; stage_name := d.name; exit;
          end if;
        end loop;
        if stage_slots is not null and not public.vp_fits_budget(stage_slots, public.vp_players_at(players, ulock)) then stage_slots := null; end if;
      end if;
      for w in select b, public.vp_week_lock(b, first_t) as lock_at, public.vp_week_end(b) as e from vp_weeks order by b loop
        if p_now < w.lock_at then continue; end if;
        use_slots := null;
        for d in select slots, name, created_at from public.deck_history where user_id = u and created_at < w.lock_at and (region = rg or region is null) order by created_at desc, id desc loop
          if public.vp_valid_deck(d.slots, public.vp_players_at(players, d.created_at), p_twin) then
            use_slots := d.slots; use_name := d.name; exit;
          end if;
        end loop;
        if use_slots is null then use_slots := prev; end if;
        if use_slots is not null then prev := use_slots; end if;
        -- From Nov 13 2026: a deck over the budget at the prices when the gameweek locks scores nothing that week.
        regular := use_slots is not null and not (w.lock_at >= timestamptz '2026-11-13 01:10:00+00'
                   and not public.vp_fits_budget(use_slots, public.vp_players_at(players, w.lock_at)));
        in_stage := stage_slots is not null and w.e > st.start_at and (st.ends_at is null or w.b < st.ends_at);
        if not regular and not in_stage then continue; end if;
        if p_now < w.e then continue; end if;
        rb := to_char(w.b at time zone 'UTC', 'YYYY-MM-DD');
        insert into vp_owed
          select u, rb, rg, coalesce(sum(greatest(0, pts)), 0), coalesce(jsonb_object_agg(v, greatest(0, pts)), '{}'::jsonb),
                 coalesce(case when regular then use_name end, stage_name, '')
          from (
            select v, sum(pts) pts from (
              select s.v, coalesce((weekpts -> rg -> rb ->> s.v)::numeric, 0) pts from jsonb_each_text(case when regular then use_slots else '{}'::jsonb end) s(k, v)
              union all
              select s.v, coalesce((select sd.d from vp_stage_delta sd where sd.b = w.b and sd.player = s.v), 0)
                from jsonb_each_text(case when in_stage then stage_slots else '{}'::jsonb end) s(k, v)
            ) x group by v
          ) q2;
      end loop;
    end loop;
  end loop;
  -- One ledger line per player and gameweek, both decks together (whole Credits).
  for q in select o.u, o.rb, round(sum(o.pts))::int owed,
                  (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from vp_owed o2, jsonb_each(o2.cards) e where o2.u = o.u and o2.rb = o.rb) cards,
                  coalesce(string_agg(nullif(o.name, ''), ' / ' order by o.region desc), '') nm
           from vp_owed o group by o.u, o.rb order by o.u, o.rb loop
    select coalesce(sum(amount), 0)::int into paid from public.vp_ledger where user_id = q.u and kind = 'week' and week = q.rb::date;
    out := out || jsonb_build_array(jsonb_build_object('user', q.u, 'week', q.rb, 'owed', q.owed, 'paid_before', paid));
    if p_pay and q.owed > paid then
      insert into public.vp_ledger (user_id, kind, week, amount, detail)
        values (q.u, 'week', q.rb::date, q.owed - paid, jsonb_build_object('deck', q.nm, 'cards', q.cards, 'topup', paid > 0));
      paid_lines := paid_lines + 1; paid_total := paid_total + (q.owed - paid);
    end if;
  end loop;
  return jsonb_build_object('payouts', paid_lines, 'vp', paid_total, 'weeks', out);
end $function$;

