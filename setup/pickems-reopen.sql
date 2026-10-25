-- PCMT Fantasy Decks: Pick'ems locks 6 hours before the next game, and reopen picks now.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once.
-- (The same functions are in pickems-setup.sql; this file only changes these and clears the old lock.)

create or replace function public.pickem_lock_time(p_bracket jsonb) returns timestamptz
language sql immutable set search_path = public as $$
  select min((s ->> 'start')::timestamptz) - interval '6 hours'
  from jsonb_array_elements(p_bracket -> 'series') s
  where jsonb_typeof(s -> 'start') = 'string' and jsonb_typeof(s -> 'score') <> 'array'
$$;

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

revoke all on function public.pickem_lock_time(jsonb) from public, anon, authenticated;
revoke all on function public.pickem_check_lock(text) from public, anon, authenticated;
revoke all on function public.save_bracket(text, jsonb) from public, anon;
grant execute on function public.save_bracket(text, jsonb) to authenticated;
revoke all on function public.save_pick(text, integer, text, integer, integer) from public, anon;
grant execute on function public.save_pick(text, integer, text, integer, integer) to authenticated;
revoke all on function public.pickem_ingest(text, timestamptz) from public, anon, authenticated;
update public.pickem_events set lock_at = null where id = 'emea-s2';

-- Check: picks should be open (lock_at empty) and the sync should say ok.
select public.pickem_sync() as sync, (select coalesce(lock_at::text, 'open') from public.pickem_events where id = 'emea-s2') as lock;
