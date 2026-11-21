-- Usernames (update, not live yet). Paste into the Supabase SQL editor on release day, before the site update goes out.
-- Players pick a username in the Account window (the person button next to Settings). It shows instead of their Discord
-- name on the leaderboards; with none set, the Discord name shows as before. 3 to 20 letters, numbers, _ . or -, no
-- two players with the same one (any capitals), and not a name the site's word filter blocks (pcmt_bad_name). A username
-- can change once every 30 days; clearing it counts as a change. profiles.name stays the Discord name (fix-display-names.sql).

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists username_changed_at timestamptz;
create unique index if not exists profiles_username_lower on public.profiles (lower(username));
alter table public.profiles drop constraint if exists profiles_username_ok;
alter table public.profiles add constraint profiles_username_ok check (username is null or username ~ '^[A-Za-z0-9_.-]{3,20}$');

create or replace function public.profiles_username_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.username is not distinct from old.username then
    new.username_changed_at := old.username_changed_at;   -- only the username's own changes move the clock
    return new;
  end if;
  if new.username is null and (tg_op = 'INSERT') then return new; end if;
  new.username := nullif(btrim(new.username), '');
  if new.username is not null and public.pcmt_bad_name(new.username) then
    raise exception 'That username isn''t allowed. Pick another one.';
  end if;
  if tg_op = 'UPDATE' and old.username_changed_at is not null and old.username_changed_at > now() - interval '30 days'
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'You can change your username again on %.', to_char(old.username_changed_at + interval '30 days', 'Mon FMDD');
  end if;
  new.username_changed_at := now();
  return new;
end $$;
drop trigger if exists profiles_username_rules on public.profiles;
create trigger profiles_username_rules before insert or update on public.profiles
  for each row execute function public.profiles_username_rules();

-- Pick'ems standings show the username too.
create or replace function public.pickem_region_standings(p_region text)
 returns table(user_id uuid, name text, points integer, picked integer)
 language sql stable security definer set search_path to 'public' as $function$
  with r as (
    select st.event, (x ->> 'n')::int n, x ->> 'winner' winner, coalesce(e.credits_win, 0) worth
    from public.pickem_state st
    left join public.pickem_events e on e.id = st.event,
    jsonb_array_elements(public.pickem_resolve(st.data)) x
    where upper(st.data ->> 'region') = upper(p_region) and x ->> 'winner' is not null)
  select p.user_id, coalesce(pr.username, pr.name, 'Manager'),
         coalesce(sum(r.worth) filter (where p.winner = r.winner), 0)::int,
         count(*)::int
  from public.pickem_picks p join r on r.event = p.event and r.n = p.series
  left join public.profiles pr on pr.id = p.user_id
  group by p.user_id, pr.username, pr.name
$function$;
