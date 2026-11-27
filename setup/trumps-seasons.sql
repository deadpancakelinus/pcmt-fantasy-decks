-- MVP VS: one deck per PCMT season (Nov 26 2026). Rooms can use any season's deck: nas4, emeas2, nas3, ... (tools/mvp-vs-cards.js).
-- Run once in the Supabase SQL editor. Safe to run again. (setup/trumps-setup.sql has the same since then.)
alter table public.trumps_rooms drop constraint if exists trumps_rooms_region_check;
alter table public.trumps_rooms add constraint trumps_rooms_region_check check (region ~ '^(na|emea)(s[0-9]{1,2})?$');

create or replace function public.trumps_create(p_region text, p_state jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare c text; n int := 0;
begin
  if not public.trumps_can_play() then raise exception 'Log in with Discord to play online.'; end if;
  if p_region !~ '^(na|emea)(s[0-9]{1,2})?$' then raise exception 'Unknown deck.'; end if;
  -- Tidy up: rooms untouched for a day are removed.
  delete from public.trumps_rooms where updated_at < now() - interval '1 day';
  if (select count(*) from public.trumps_rooms where host = auth.uid()) >= 5 then
    raise exception 'You already have 5 open rooms. Finish one first.';
  end if;
  loop
    c := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
            from generate_series(1, 5));
    exit when length(c) = 5 and not exists (select 1 from public.trumps_rooms where code = c);
    n := n + 1; if n > 20 then raise exception 'Could not make a room code, try again.'; end if;
  end loop;
  insert into public.trumps_rooms (code, region, host, host_name, state)
  values (c, p_region, auth.uid(), coalesce((select name from public.profiles where id = auth.uid()), 'Player 1'), p_state);
  return c;
end $$;
