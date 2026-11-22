-- Profile pictures (update, not live yet). Paste into the Supabase SQL editor on release day, after usernames.sql.
-- Players upload a picture in the Account window; it shows next to their name on The Deck Leaderboard. The site crops
-- and shrinks it to a 256 x 256 WebP before uploading. Stored in the public "avatars" bucket as <user id>.webp (anyone
-- can view it; only its owner can add, replace or remove it; PCMT Team staff can remove any). profiles.picture_at says
-- when it last changed (null = no picture), which the site also uses so a new picture is never shown from a cache.
-- Safe to run again.

alter table public.profiles add column if not exists picture_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 262144, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars: read own" on storage.objects;
create policy "avatars: read own" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text || '.webp');   -- needed to replace it (upsert); viewing goes through the public link
drop policy if exists "avatars: add own" on storage.objects;
create policy "avatars: add own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name = auth.uid()::text || '.webp');
drop policy if exists "avatars: replace own" on storage.objects;
create policy "avatars: replace own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text || '.webp')
  with check (bucket_id = 'avatars' and name = auth.uid()::text || '.webp');
drop policy if exists "avatars: remove own or staff" on storage.objects;
create policy "avatars: remove own or staff" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (name = auth.uid()::text || '.webp'
         or public.is_freshbatch() or exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid())));

-- Staff: take a player's picture down (their name shows with their Discord avatar again). The site stops showing it at
-- once; the file itself can be deleted from Storage (Supabase doesn't allow deleting Storage files from SQL).
create or replace function public.fb_clear_picture(p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_freshbatch() or exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid())) then
    raise exception 'Only PCMT Team staff can do that.';
  end if;
  update public.profiles set picture_at = null where id = p_user;
  return true;
end $$;
revoke all on function public.fb_clear_picture(uuid) from public, anon;
grant execute on function public.fb_clear_picture(uuid) to authenticated;
