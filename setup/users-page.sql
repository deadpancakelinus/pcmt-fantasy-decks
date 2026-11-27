-- Backend Users page: one row per user, for staff only.
-- Name, username and picture (profiles); when they joined and last logged in; deck saves and their latest deck;
-- Pick'ems picks; MVP VS wins and games (once setup/trumps-tiers.sql and trumps-4p.sql have run). No emails.
-- Safe to run more than once.

create or replace function public.fb_users()
returns table (
  id uuid, name text, username text, avatar_url text, picture_at timestamptz,
  joined timestamptz, last_seen timestamptz,
  deck_saves integer, last_save timestamptz, latest_deck text, latest_region text,
  pickem_picks integer, mvp_wins integer, mvp_games integer, staff boolean
)
language plpgsql stable security definer set search_path = public as $$
declare has_mvp boolean := to_regclass('public.trumps_results') is not null;
begin
  if not public.is_freshbatch() then raise exception 'staff only'; end if;
  return query execute format($q$
    select u.id, coalesce(p.name, ''), p.username, p.avatar_url, p.picture_at,
           u.created_at, u.last_sign_in_at,
           coalesce(d.n, 0)::integer, d.last_at, d.last_name, d.last_region,
           coalesce(k.n, 0)::integer, %s, %s,
           exists (select 1 from public.freshbatch_staff s where s.user_id = u.id)
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join lateral (
      select count(*) as n, max(h.created_at) as last_at,
             (array_agg(h.name order by h.created_at desc, h.id desc))[1] as last_name,
             (array_agg(h.region order by h.created_at desc, h.id desc))[1] as last_region
      from public.deck_history h where h.user_id = u.id
    ) d on true
    left join lateral (select count(*) as n from public.pickem_picks x where x.user_id = u.id) k on true
    %s
    order by u.created_at desc
  $q$,
    case when has_mvp then 'coalesce(m.wins, 0)::integer' else '0' end,
    case when has_mvp then 'coalesce(m.games, 0)::integer' else '0' end,
    case when has_mvp then 'left join lateral (select count(*) filter (where r.winner = u.id) as wins, count(*) as games
                                               from public.trumps_results r where u.id = any (r.players)) m on true'
         else '' end);
end;
$$;
revoke all on function public.fb_users() from public, anon;
grant execute on function public.fb_users() to authenticated;
