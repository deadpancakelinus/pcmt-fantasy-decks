-- PCMT Fantasy Decks: never keep email addresses (Oct 25 2026).
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once.
--
-- Discord sends the email with every login (Supabase always asks for it). These triggers drop it before it is written:
--   * auth.users: email emptied, and email / email_verified taken out of the user's details.
--   * auth.identities: email / email_verified taken out of the Discord details (the email column follows on its own).
--   * auth.audit_log_entries: the login log's copy of the email taken out.
-- Logins still work: Supabase finds a returning player by their Discord account id, not their email.
-- The last part removes the emails already saved.

create or replace function public.pcmt_strip_email_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.email := null;
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'email' - 'email_verified';
  return new;
end $$;
drop trigger if exists pcmt_strip_email on auth.users;
create trigger pcmt_strip_email before insert or update on auth.users
  for each row execute function public.pcmt_strip_email_user();

create or replace function public.pcmt_strip_email_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.identity_data := coalesce(new.identity_data, '{}'::jsonb) - 'email' - 'email_verified';
  return new;
end $$;
drop trigger if exists pcmt_strip_email on auth.identities;
create trigger pcmt_strip_email before insert or update on auth.identities
  for each row execute function public.pcmt_strip_email_identity();

create or replace function public.pcmt_strip_email_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p jsonb;
begin
  if new.payload is not null then
    p := new.payload::jsonb - 'actor_username';
    if jsonb_typeof(p -> 'traits') = 'object' then p := jsonb_set(p, '{traits}', (p -> 'traits') - 'user_email' - 'email'); end if;
    new.payload := p::json;
  end if;
  return new;
end $$;
drop trigger if exists pcmt_strip_email on auth.audit_log_entries;
create trigger pcmt_strip_email before insert or update on auth.audit_log_entries
  for each row execute function public.pcmt_strip_email_audit();

revoke all on function public.pcmt_strip_email_user() from public, anon, authenticated;
revoke all on function public.pcmt_strip_email_identity() from public, anon, authenticated;
revoke all on function public.pcmt_strip_email_audit() from public, anon, authenticated;

-- Remove the emails already saved (the triggers above do the work on update).
update auth.users set email = null where true;
update auth.identities set identity_data = identity_data where true;
update auth.audit_log_entries set payload = payload where payload::jsonb ? 'actor_username' or payload::jsonb -> 'traits' ? 'user_email';

-- Check: every count should be 0.
select (select count(*) from auth.users where email is not null or raw_user_meta_data ? 'email') as users_with_email,
       (select count(*) from auth.identities where identity_data ? 'email') as identities_with_email,
       (select count(*) from auth.audit_log_entries where payload::jsonb ? 'actor_username' or payload::jsonb -> 'traits' ? 'user_email') as log_rows_with_email;
