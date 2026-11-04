-- =====================================================================
-- AION 2 Guild Command — 0007 Party preset content type and dungeon name
-- Run after 0006 (Supabase Dashboard → SQL Editor). Re-runnable.
-- Run this BEFORE deploying the app code that reads these columns.
--
--  * party_presets.content_type — content category; NULL = not set.
--  * party_presets.dungeon_name — free text, independent of the category.
--  * save_party_preset          — also writes both columns. The new parameters
--                                 default to NULL, so the previous app build can
--                                 still call it, but each save from that build
--                                 clears both columns on the saved preset.
--
-- Existing presets keep NULL in both columns.
-- =====================================================================

begin;

alter table public.party_presets
  add column if not exists content_type text check (
    content_type is null or content_type in (
      'Expedition',
      'Transcendence',
      'Raid – Sanctuary',
      'Raid – Abyssal Forge: Ludra',
      'Daily Dungeon',
      'Other'
    )
  ),
  add column if not exists dungeon_name text check (
    dungeon_name is null or char_length(btrim(dungeon_name)) between 1 and 60
  );

-- save_party_preset is SECURITY INVOKER, so it needs these column grants.
grant insert (content_type, dungeon_name) on public.party_presets to authenticated;
grant update (content_type, dungeon_name) on public.party_presets to authenticated;

-- ---------------------------------------------------------------------
-- save_party_preset — same as 0006, plus content_type and dungeon_name.
-- The old signature is dropped so that no second overload remains.
-- ---------------------------------------------------------------------
drop function if exists public.save_party_preset(text, text, smallint, jsonb);

create or replace function public.save_party_preset(
  p_legacy_id text,
  p_name text,
  p_slot_count smallint,
  p_slots jsonb,
  p_content_type text default null,
  p_dungeon_name text default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_guild uuid := public.current_guild_id();
  v_id uuid;
  v_dungeon text := nullif(btrim(p_dungeon_name), '');
begin
  if v_guild is null or not public.is_guild_leader(v_guild) then
    raise exception 'LEADER_ONLY: Only the Guild Leader can do this.' using errcode = '42501';
  end if;
  if p_legacy_id is null or p_legacy_id !~ '^p-[a-z0-9-]{3,40}$' then
    raise exception 'INVALID_OP: Invalid preset id.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_slots, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_OP: Slots must be an array.' using errcode = '22023';
  end if;

  select p.id into v_id from public.party_presets p where p.guild_id = v_guild and p.legacy_id = p_legacy_id;
  if v_id is null then
    insert into public.party_presets (guild_id, legacy_id, name, slot_count, created_by, content_type, dungeon_name)
    values (v_guild, p_legacy_id, btrim(p_name), p_slot_count, auth.uid(), p_content_type, v_dungeon)
    returning id into v_id;
  else
    delete from public.party_preset_slots s where s.preset_id = v_id;
    update public.party_presets
    set name = btrim(p_name), slot_count = p_slot_count, content_type = p_content_type, dungeon_name = v_dungeon
    where id = v_id;
  end if;

  insert into public.party_preset_slots (guild_id, preset_id, position, roster_member_id, role)
  select v_guild, v_id, (e->>'position')::smallint,
         nullif(e->>'roster_member_id', '')::uuid,
         nullif(e->>'role', '')::public.party_role
  from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) as e;

  return v_id;
end $$;

revoke all on function public.save_party_preset(text, text, smallint, jsonb, text, text) from public, anon;
grant execute on function public.save_party_preset(text, text, smallint, jsonb, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';
