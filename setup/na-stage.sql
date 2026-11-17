-- NA Stage 1 (Nov 17 2026). Paste into the Supabase SQL editor after vp-setup.sql and thursday-weeks.sql.
-- Every NA series from the stage's first game (FNC vs WBG, start_at) counts. NA decks lock Sat Nov 21 9:00 PM EST
-- (lock_at, when NBR vs PRX starts) and stay locked until the stage ends. The deck that
-- counts is the last valid one saved before that lock (over budget at the lock: it scores nothing in the stage). Each
-- player in it scores only their two best NA series of the stage; each gameweek pays what that best-two total grew by,
-- so the weeks add up to the stage total. NA results outside the stage and every EMEA result pay as before.
-- Same rules as NA_STAGE in tools/league.js and PCMT_NA_STAGE in the Main board. Set ends_at when the stage's end is known:
--   create or replace function public.vp_na_stage(...) ... select <start>, <lock>, timestamptz '<end>';

drop function if exists public.vp_na_stage() cascade;
create or replace function public.vp_na_stage(out start_at timestamptz, out lock_at timestamptz, out ends_at timestamptz)
language sql immutable as $$ select timestamptz '2026-11-18 03:00:00+00', timestamptz '2026-11-22 02:00:00+00', null::timestamptz $$;

create or replace function public.vp_in_na_stage(r jsonb) returns boolean
language sql stable as $$
  select coalesce(r ->> 'region', '') = 'NA' and public.vp_ts(r ->> 'start') >= s.start_at
         and (s.ends_at is null or public.vp_ts(r ->> 'start') < s.ends_at)
  from public.vp_na_stage() s
$$;

create or replace function public.vp_compute(p_matches jsonb, p_results jsonb, p_players jsonb, p_twin jsonb, p_now timestamptz default now(), p_pay boolean default true)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  players jsonb; weekpts jsonb := '{}'::jsonb; r jsonb; rb text; sp record; st record;
  w record; u uuid; d record; use_slots jsonb; use_name text; prev jsonb; owed int; paid int; cards jsonb;
  stage_slots jsonb; stage_name text; regular boolean; in_stage boolean;
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
      insert into vp_stage select q.k, public.vp_ts(r ->> 'start'), (q.v #>> '{}')::numeric from jsonb_each(public.vp_series_points(r, players)) q(k, v);
      continue;
    end if;
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
  -- What each player's best-two stage total grew by in each gameweek.
  create temp table if not exists vp_stage_delta (b timestamptz, player text, d numeric) on commit drop;
  truncate vp_stage_delta;
  insert into vp_stage_delta
    select wk.b, coalesce(z.player, a.player), coalesce(z.s, 0) - coalesce(a.s, 0)
    from vp_weeks wk
    cross join lateral (select player, sum(pts) s from (select player, pts, row_number() over (partition by player order by pts desc) rn
                         from vp_stage where t < public.vp_week_end(wk.b)) q where rn <= 2 group by player) z
    left join lateral (select player, sum(pts) s from (select player, pts, row_number() over (partition by player order by pts desc) rn
                         from vp_stage where t < wk.b) q where rn <= 2 group by player) a on a.player = z.player;
  for u in select distinct user_id from public.deck_history loop
    prev := null; use_name := null;
    stage_slots := null; stage_name := null;
    for d in select slots, name, created_at from public.deck_history where user_id = u and created_at < st.lock_at order by created_at desc, id desc loop
      if public.vp_valid_deck(d.slots, public.vp_players_at(players, d.created_at), p_twin) then
        stage_slots := d.slots; stage_name := d.name; exit;
      end if;
    end loop;
    if stage_slots is not null and not public.vp_fits_budget(stage_slots, public.vp_players_at(players, st.lock_at)) then stage_slots := null; end if;
    for w in select b, public.vp_week_lock(b, first_t) as lock_at, public.vp_week_end(b) as e from vp_weeks order by b loop
      if p_now < w.lock_at then continue; end if;
      use_slots := null;
      for d in select slots, name, created_at from public.deck_history where user_id = u and created_at < w.lock_at order by created_at desc, id desc loop
        if public.vp_valid_deck(d.slots, public.vp_players_at(players, d.created_at), p_twin) then
          use_slots := d.slots; use_name := d.name; exit;
        end if;
      end loop;
      if use_slots is null then use_slots := prev; end if;
      if use_slots is not null then prev := use_slots; end if;
      -- From Nov 13 2026: a deck over the budget at the prices when the gameweek locks scores nothing that week
      -- (the red "please relock your deck" window). Earlier gameweeks are unchanged.
      regular := use_slots is not null and not (w.lock_at >= timestamptz '2026-11-13 01:10:00+00'
                 and not public.vp_fits_budget(use_slots, public.vp_players_at(players, w.lock_at)));
      in_stage := stage_slots is not null and w.e > st.start_at and (st.ends_at is null or w.b < st.ends_at);
      if not regular and not in_stage then continue; end if;
      if p_now < w.e then continue; end if;
      rb := to_char(w.b at time zone 'UTC', 'YYYY-MM-DD');
      select coalesce(jsonb_object_agg(v, greatest(0, pts)), '{}'::jsonb), round(coalesce(sum(greatest(0, pts)), 0))::int
        into cards, owed
        from (
          select v, sum(pts) pts from (
            select s.v, coalesce((weekpts -> rb ->> s.v)::numeric, 0) pts from jsonb_each_text(case when regular then use_slots else '{}'::jsonb end) s(k, v)
            union all
            select s.v, coalesce((select sd.d from vp_stage_delta sd where sd.b = w.b and sd.player = s.v), 0)
              from jsonb_each_text(case when in_stage then stage_slots else '{}'::jsonb end) s(k, v)
          ) x group by v
        ) q;
      select coalesce(sum(amount), 0)::int into paid from public.vp_ledger where user_id = u and kind = 'week' and week = rb::date;
      out := out || jsonb_build_array(jsonb_build_object('user', u, 'week', rb, 'owed', owed, 'paid_before', paid));
      if p_pay and owed > paid then
        insert into public.vp_ledger (user_id, kind, week, amount, detail)
          values (u, 'week', rb::date, owed - paid, jsonb_build_object('deck', coalesce(case when regular then use_name end, stage_name, ''), 'cards', cards, 'topup', paid > 0));
        paid_lines := paid_lines + 1; paid_total := paid_total + (owed - paid);
      end if;
    end loop;
  end loop;
  return jsonb_build_object('payouts', paid_lines, 'vp', paid_total, 'weeks', out);
end $function$;
