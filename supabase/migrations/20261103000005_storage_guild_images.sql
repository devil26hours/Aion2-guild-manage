-- =====================================================================
-- AION 2 Guild Command — 0005 Storage bucket for guild images
-- Run after 0004. Replaces data/guilds/<gid>/uploads/guild-image/.
-- Object path: "<guild uuid>/guild-<id>-<16 hex>.(png|jpg)"
-- The server still checks magic bytes before uploading (as today).
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guild-images', 'guild-images', false, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Guild uuid from the first path segment (null when it is not a uuid).
create or replace function public.storage_guild_id(p_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;
grant execute on function public.storage_guild_id(text) to authenticated;

drop policy if exists guild_images_select on storage.objects;
create policy guild_images_select on storage.objects for select to authenticated
  using (bucket_id = 'guild-images' and public.is_guild_member(public.storage_guild_id(name)));

drop policy if exists guild_images_insert_leader on storage.objects;
create policy guild_images_insert_leader on storage.objects for insert to authenticated
  with check (
    bucket_id = 'guild-images'
    and public.is_guild_leader(public.storage_guild_id(name))
    and name ~ '^[0-9a-f-]{36}/guild-[0-9a-z]{6,20}-[0-9a-f]{16}\.(png|jpg)$'
  );

drop policy if exists guild_images_update_leader on storage.objects;
create policy guild_images_update_leader on storage.objects for update to authenticated
  using (bucket_id = 'guild-images' and public.is_guild_leader(public.storage_guild_id(name)))
  with check (bucket_id = 'guild-images' and public.is_guild_leader(public.storage_guild_id(name)));

drop policy if exists guild_images_delete_leader on storage.objects;
create policy guild_images_delete_leader on storage.objects for delete to authenticated
  using (bucket_id = 'guild-images' and public.is_guild_leader(public.storage_guild_id(name)));
