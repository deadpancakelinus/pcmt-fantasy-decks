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
