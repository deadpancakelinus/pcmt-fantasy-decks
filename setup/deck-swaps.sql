-- Decks tab on the backend: staff swap one player in someone's saved deck.
-- Run once in the Supabase SQL editor. Safe to run again.
--
-- fb_deck_swap(deck, slot, player in, as_new):
--   as_new = false: changes that saved deck itself, so every gameweek it already counted for changes too.
--   as_new = true:  saves a copy with the swap as a new deck for that user (same as them saving now), so it only
--                   counts from the next lock.
-- If the player going out is the IGL, the player coming in becomes the IGL. Every swap is kept in deck_swaps.

create table if not exists public.deck_swaps (
  id bigint generated always as identity primary key,
  deck_id bigint not null,
  user_id uuid not null,
  slot text not null,
  player_out text not null,
  player_in text not null,
  as_new boolean not null default false,
  new_deck_id bigint,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
alter table public.deck_swaps enable row level security;
drop policy if exists "staff read deck swaps" on public.deck_swaps;
create policy "staff read deck swaps" on public.deck_swaps for select using (public.is_freshbatch());

create or replace function public.fb_deck_swap(p_deck bigint, p_slot text, p_in text, p_new boolean default false)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  d public.deck_history;
  v_out text;
  v_slots jsonb;
  v_igl text;
  v_id bigint;
begin
  if not public.is_freshbatch() then raise exception 'Staff only.'; end if;
  select * into d from public.deck_history where id = p_deck;
  if not found then raise exception 'That deck doesn''t exist.'; end if;
  v_out := d.slots ->> p_slot;
  if v_out is null then raise exception 'That deck has no % slot.', p_slot; end if;
  p_in := trim(coalesce(p_in, ''));
  if p_in = '' then raise exception 'Pick a player to put in.'; end if;
  if p_in = v_out then raise exception 'That player is already in that slot.'; end if;
  if exists (select 1 from jsonb_each_text(d.slots) s where s.value = p_in) then raise exception 'That player is already in this deck.'; end if;
  v_slots := jsonb_set(d.slots, array[p_slot], to_jsonb(p_in));
  v_igl := case when d.igl = v_out then p_in else d.igl end;
  if p_new then
    insert into public.deck_history (user_id, name, slots, igl, region)
    values (d.user_id, d.name, v_slots, v_igl, d.region) returning id into v_id;
  else
    update public.deck_history set slots = v_slots, igl = v_igl where id = d.id;
    v_id := d.id;
  end if;
  insert into public.deck_swaps (deck_id, user_id, slot, player_out, player_in, as_new, new_deck_id)
  values (d.id, d.user_id, p_slot, v_out, p_in, coalesce(p_new, false), case when p_new then v_id end);
  return v_id;
end $$;
revoke all on function public.fb_deck_swap(bigint, text, text, boolean) from public, anon;
grant execute on function public.fb_deck_swap(bigint, text, text, boolean) to authenticated;
