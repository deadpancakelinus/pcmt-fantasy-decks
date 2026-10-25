-- PCMT Fantasy Decks: the PCMT Team backend (backend.html).
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once.
-- Needs setup/vp-setup.sql (staff list, VP) and setup/cards-setup.sql (cards) first.
--
--   * freshbatch_staff (in vp-setup.sql): who can use the backend. Add someone with
--       insert into public.freshbatch_staff (user_id) values ('<account id>') on conflict do nothing;
--   * player_price_changes: every price change made on the backend, kept forever. The site and the VP payout
--     use the newest change for today's prices, and the change in effect when a deck was saved to check its budget.
--     A row with price null puts that player back on the players.js price.
--   * fb_card_counts(): copies and owners of every card, for the backend's cards sheet (staff only).

-- ===================== Player prices =====================
create table if not exists public.player_price_changes (
  id bigserial primary key,
  player text not null,                      -- player id from players.js
  price numeric(4, 1) check (price is null or (price between 0 and 30 and price * 2 = round(price * 2))),
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users (id) on delete set null
);
create index if not exists player_price_changes_player on public.player_price_changes (player, changed_at);
alter table public.player_price_changes enable row level security;
drop policy if exists "anyone reads prices" on public.player_price_changes;
create policy "anyone reads prices" on public.player_price_changes for select using (true);
drop policy if exists "staff add prices" on public.player_price_changes;
create policy "staff add prices" on public.player_price_changes for insert with check (public.is_freshbatch());
-- No update/delete policies: the history can't be rewritten from the site.

create or replace function public.player_price_stamp() returns trigger
language plpgsql as $$
begin
  new.changed_at := now();
  new.changed_by := auth.uid();
  return new;
end $$;
drop trigger if exists player_price_stamp on public.player_price_changes;
create trigger player_price_stamp before insert on public.player_price_changes
  for each row execute function public.player_price_stamp();

-- ===================== Cards sheet =====================
create or replace function public.fb_card_counts() returns table (card_id text, copies bigint, owners bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_freshbatch() then raise exception 'PCMT Team staff only.'; end if;
  return query select uc.card_id, sum(uc.count)::bigint, count(distinct uc.user_id)::bigint from public.user_cards uc group by uc.card_id;
end $$;
revoke all on function public.fb_card_counts() from public, anon;
grant execute on function public.fb_card_counts() to authenticated;

-- ===================== Page password =====================
-- backend.html asks for a page password before the Discord login. Only a bcrypt hash is stored, and only the
-- database owner can set it. Set or change it in the Supabase SQL editor with:
--   select public.fb_set_page_password('<new password>');
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.freshbatch_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.freshbatch_settings enable row level security;   -- no policies: nobody reads it from the site

create or replace function public.fb_set_page_password(p_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_password is null or length(p_password) < 8 then raise exception 'Use at least 8 characters.'; end if;
  insert into public.freshbatch_settings (key, value, updated_at) values ('page_password', extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  return 'Page password set.';
end $$;
revoke all on function public.fb_set_page_password(text) from public, anon, authenticated;

-- true = right password, false = wrong, null = no password set yet. A wrong guess waits a second.
create or replace function public.fb_page_unlock(p_password text) returns boolean
language plpgsql volatile security definer set search_path = public, extensions as $$
declare h text;
begin
  select value into h from public.freshbatch_settings where key = 'page_password';
  if h is null then return null; end if;
  if p_password is not null and extensions.crypt(p_password, h) = h then return true; end if;
  perform pg_sleep(1);
  return false;
end $$;
revoke all on function public.fb_page_unlock(text) from public;
grant execute on function public.fb_page_unlock(text) to anon, authenticated;

-- ===================== Comments and complaints =====================
-- Written on the Home page (up to 50 words), read by staff in the backend's Complaints log.
-- Sent only through submit_complaint(); nobody can insert or edit rows directly. Staff delete one with "Settled" in the backend.
create table if not exists public.complaints (
  id bigserial primary key,
  body text not null check (char_length(body) between 1 and 1000),
  words integer not null,
  user_id uuid references auth.users (id) on delete set null,   -- null = written while logged out
  created_at timestamptz not null default now()
);
create index if not exists complaints_created on public.complaints (created_at desc);
alter table public.complaints enable row level security;
drop policy if exists "staff read complaints" on public.complaints;
create policy "staff read complaints" on public.complaints for select using (public.is_freshbatch());
drop policy if exists "staff settle complaints" on public.complaints;
create policy "staff settle complaints" on public.complaints for delete using (public.is_freshbatch());

-- Words are counted the same way as on the Home page: runs of non-space characters.
create or replace function public.submit_complaint(p_body text) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare b text := btrim(coalesce(p_body, '')); n int; uid uuid := auth.uid(); new_id bigint;
begin
  n := case when b = '' then 0 else coalesce(array_length(regexp_split_to_array(b, '\s+'), 1), 0) end;
  if n = 0 then raise exception 'Write something first.'; end if;
  if n > 50 then raise exception 'Keep it to 50 words (you have %).', n; end if;
  if char_length(b) > 1000 then raise exception 'That''s too long. Keep it under 1,000 characters.'; end if;
  -- Limits against spam: 5 an hour for each logged-in player, 20 an hour from everyone logged out.
  if uid is not null then
    if (select count(*) from public.complaints where user_id = uid and created_at > now() - interval '1 hour') >= 5 then
      raise exception 'You''ve sent a lot this hour. Try again a bit later.'; end if;
  elsif (select count(*) from public.complaints where user_id is null and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Lots of comments right now. Log in with Discord or try again a bit later.';
  end if;
  insert into public.complaints (body, words, user_id) values (b, n, uid) returning id into new_id;
  return new_id;
end $$;
revoke all on function public.submit_complaint(text) from public;
grant execute on function public.submit_complaint(text) to anon, authenticated;
