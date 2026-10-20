-- PCMT Fantasy Decks: leaderboard names always come from Discord.
-- Players can't set their own display name; it's copied from their Discord account every time it's saved.
-- If the Discord display name has no letters or numbers (for example "..."), the Discord username is used.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run more than once.
create or replace function public.profiles_real_name() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare md jsonb; cand text; pick text;
begin
  select raw_user_meta_data into md from auth.users where id = new.id;
  -- Discord display name first, then the Discord username. A name with no letters or
  -- numbers (like "...") is skipped so the leaderboard always shows something readable.
  foreach cand in array array[md -> 'custom_claims' ->> 'global_name', md ->> 'full_name',
                               md ->> 'name', md ->> 'user_name', md ->> 'preferred_username'] loop
    cand := btrim(regexp_replace(coalesce(cand, ''), '#0$', ''));
    if cand ~ '[[:alnum:]]' then pick := cand; exit; end if;
  end loop;
  new.name := left(coalesce(pick, 'Manager'), 40);
  new.avatar_url := md ->> 'avatar_url';
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists profiles_real_name on public.profiles;
create trigger profiles_real_name before insert or update on public.profiles
  for each row execute function public.profiles_real_name();
-- Re-apply to anyone already signed up.
update public.profiles set updated_at = now();
