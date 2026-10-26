-- PCMT Fantasy Decks: the Delete my account button on Home.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once. (Also in setup/backend-setup.sql.)

-- ===================== Delete my account =====================
-- delete_my_account(): a logged-in player deletes their own account (button at the bottom of Home).
-- Their comments go first; deleting the auth.users row then removes everything else saved with the account
-- (profile, decks, unlocks, Credits, cards, pack openings, Pick'ems picks, MVP VS rooms, logins). It can't be undone.
create or replace function public.delete_my_account() returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Log in with Discord first.'; end if;
  delete from public.complaints where user_id = u;
  delete from auth.users where id = u;
  return true;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
