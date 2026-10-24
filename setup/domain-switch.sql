-- PCMT Fantasy Decks: point the two hourly jobs (Credits payout, Pick'ems) at https://fantasy.pcmt.gg.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once.
-- (The same functions are in vp-setup.sql and pickems-setup.sql; this file changes only these two.)

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
revoke all on function public.vp_sync() from public, anon, authenticated;

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
revoke all on function public.pickem_sync() from public, anon, authenticated;

-- Check: both should say ok.
select public.vp_sync() as credits, public.pickem_sync() as pickems;
