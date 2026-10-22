-- PCMT Fantasy Decks: the Freshbatch backend (backend.html).
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
  if not public.is_freshbatch() then raise exception 'Freshbatch staff only.'; end if;
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
