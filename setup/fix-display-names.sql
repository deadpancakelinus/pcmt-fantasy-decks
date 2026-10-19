-- PCMT Fantasy Decks: leaderboard names always come from Discord.
-- Players can't set their own display name; it's copied from their Discord account every time it's saved.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run more than once.
create or replace function public.profiles_real_name() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare md jsonb;
begin
  select raw_user_meta_data into md from auth.users where id = new.id;
  new.name := left(regexp_replace(coalesce(
      nullif(md -> 'custom_claims' ->> 'global_name', ''),
      nullif(md ->> 'full_name', ''),
      nullif(md ->> 'name', ''),
      'Manager'), '#0$', ''), 40);
  new.avatar_url := md ->> 'avatar_url';
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists profiles_real_name on public.profiles;
create trigger profiles_real_name before insert or update on public.profiles
  for each row execute function public.profiles_real_name();
-- Re-apply to anyone already signed up.
update public.profiles set updated_at = now();
