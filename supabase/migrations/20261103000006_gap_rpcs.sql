-- =====================================================================
-- AION 2 Guild Command — 0006 RPCs for behaviour RLS alone can't express
-- Run after 0005 (Supabase Dashboard → SQL Editor). Re-runnable.
--
--  * list_joinable_guilds   — guild browser before joining (safe public fields
--                             + member count + whether a join code is set).
--  * guild_join_code_set    — "is a join code configured?" for the caller's
--                             own guild (never the hash).
--  * add_roster_member      — Guild Leader adds a character; a registered owner
--                             without a guild joins automatically (atomic).
--  * save_party_preset      — create/replace one preset and its slots in one
--                             transaction. SECURITY INVOKER: normal RLS applies.
--
-- No table, column, policy or grant from 0001–0005 is changed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- list_joinable_guilds — any signed-in user. Only fields the JSON guild
-- browser already showed. No hashes, no member identities, no settings.
-- ---------------------------------------------------------------------
create or replace function public.list_joinable_guilds(p_query text default null)
returns table (
  id                 uuid,
  name               text,
  server             text,
  description        text,
  member_count       bigint,
  member_cap         integer,
  leader_name        text,
  has_image          boolean,
  image_uploaded_at  timestamptz,
  join_code_set      boolean,
  created_at         timestamptz
)
language sql stable security definer set search_path = '' as $$
  with q as (select lower(left(btrim(coalesce(p_query, '')), 60)) as term)
  select
    g.id, g.name, g.server, g.description,
    (select count(*) from public.guild_roster_members r where r.guild_id = g.id),
    g.member_cap,
    l.leader_name,
    g.image_path is not null,
    g.image_uploaded_at,
    exists (select 1 from public.guild_secrets s where s.guild_id = g.id and s.join_code_hash is not null),
    g.created_at
  from public.guilds g
  cross join q
  left join lateral (
    select coalesce(
      (select c.character_name
         from public.character_ownerships o
         join public.characters c on c.id = o.character_id
        where o.user_id = g.leader_user_id),
      nullif(g.leader_label, '')
    ) as leader_name
  ) l on true
  where (select auth.uid()) is not null
    -- strpos (not LIKE): the search text is never interpreted as a pattern.
    and (q.term = '' or strpos(lower(concat_ws(' ', g.name, g.server, g.description, l.leader_name)), q.term) > 0)
  order by lower(g.name), g.id
  limit 200
$$;

-- ---------------------------------------------------------------------
-- guild_join_code_set — true/false for the caller's own guild, null when
-- the caller has no guild. The hash itself never leaves the database.
-- ---------------------------------------------------------------------
create or replace function public.guild_join_code_set()
returns boolean
language sql stable security definer set search_path = '' as $$
  select s.join_code_hash is not null
  from public.guild_secrets s
  where s.guild_id = public.current_guild_id()
$$;

-- ---------------------------------------------------------------------
-- add_roster_member — Guild Leader only. The character row must already
-- exist (written by the server from the AION 2 API). Rules:
--   * a character is in at most one roster        → DUPLICATE / CHARACTER_IN_GUILD
--   * an owner in ANOTHER guild blocks the add    → OWNER_IN_OTHER_GUILD
--   * the member cap trigger still applies        → MEMBER_CAP
--   * an owner account WITHOUT a guild joins this guild as a member.
-- Lock order matches join_guild/create_guild (owner profile first) and the
-- character lock is FOR NO KEY UPDATE, so FK checks are not blocked.
-- ---------------------------------------------------------------------
create or replace function public.add_roster_member(
  p_character uuid,
  p_role public.party_role default null,
  p_notes text default ''
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_guild uuid := public.current_guild_id();
  v_owner uuid;
  v_owner_guild uuid;
  v_existing uuid;
  v_member uuid;
  v_linked boolean := false;
  v_notes text := btrim(coalesce(p_notes, ''));
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  if v_guild is null or not public.is_guild_leader(v_guild) then
    raise exception 'LEADER_ONLY: Only the Guild Leader can do this.' using errcode = '42501';
  end if;
  if char_length(v_notes) > 300 then
    raise exception 'INVALID_BODY: notes must be at most 300 characters.' using errcode = '22023';
  end if;

  select o.user_id into v_owner from public.character_ownerships o where o.character_id = p_character;
  if v_owner is not null then
    perform 1 from public.profiles p where p.id = v_owner for update;
    -- re-read under the lock (a claim may have raced us)
    select o.user_id into v_owner from public.character_ownerships o where o.character_id = p_character;
  end if;

  perform 1 from public.characters c where c.id = p_character for no key update;
  if not found then
    raise exception 'CHARACTER_NOT_FOUND: Character not found.' using errcode = 'P0002';
  end if;

  select r.guild_id into v_existing from public.guild_roster_members r where r.character_id = p_character;
  if v_existing = v_guild then
    raise exception 'DUPLICATE: This character is already in the guild roster.' using errcode = 'P0001';
  elsif v_existing is not null then
    raise exception 'CHARACTER_IN_GUILD: This character is already in another guild''s roster.' using errcode = 'P0001';
  end if;

  if v_owner is not null then
    select m.guild_id into v_owner_guild from public.guild_memberships m where m.user_id = v_owner;
    if v_owner_guild is not null and v_owner_guild <> v_guild then
      raise exception 'OWNER_IN_OTHER_GUILD: This character''s owner belongs to another guild.' using errcode = 'P0001';
    end if;
  end if;

  begin
    insert into public.guild_roster_members (guild_id, character_id, role, notes, added_by)
    values (v_guild, p_character, p_role, v_notes, v_uid)
    returning id into v_member;
  exception when unique_violation then
    raise exception 'CHARACTER_IN_GUILD: This character is already in a guild roster.' using errcode = 'P0001';
  end;

  if v_owner is not null and v_owner_guild is null then
    insert into public.guild_memberships (user_id, guild_id, role) values (v_owner, v_guild, 'member');
    v_linked := true;
    perform public.write_audit(v_guild, 'guild.link_account', jsonb_build_object('user_id', v_owner, 'character_id', p_character));
  end if;

  perform public.write_audit(v_guild, 'roster.add', jsonb_build_object('roster_member_id', v_member, 'character_id', p_character));
  return jsonb_build_object('roster_member_id', v_member, 'linked_owner', v_linked);
end $$;

-- ---------------------------------------------------------------------
-- save_party_preset — create (by legacy_id) or replace one preset + its
-- slots atomically. SECURITY INVOKER: the caller's RLS policies and column
-- grants apply (Guild Leader only); this only adds the transaction.
-- p_slots: [{ "position": 0, "roster_member_id": "<uuid>|null", "role": "Tank|…|null" }, …]
-- ---------------------------------------------------------------------
create or replace function public.save_party_preset(
  p_legacy_id text,
  p_name text,
  p_slot_count smallint,
  p_slots jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_guild uuid := public.current_guild_id();
  v_id uuid;
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
    insert into public.party_presets (guild_id, legacy_id, name, slot_count, created_by)
    values (v_guild, p_legacy_id, btrim(p_name), p_slot_count, auth.uid())
    returning id into v_id;
  else
    delete from public.party_preset_slots s where s.preset_id = v_id;
    update public.party_presets set name = btrim(p_name), slot_count = p_slot_count where id = v_id;
  end if;

  insert into public.party_preset_slots (guild_id, preset_id, position, roster_member_id, role)
  select v_guild, v_id, (e->>'position')::smallint,
         nullif(e->>'roster_member_id', '')::uuid,
         nullif(e->>'role', '')::public.party_role
  from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) as e;

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Grants: signed-in users only (each function checks the caller itself).
-- ---------------------------------------------------------------------
revoke all on function public.list_joinable_guilds(text) from public, anon;
revoke all on function public.guild_join_code_set() from public, anon;
revoke all on function public.add_roster_member(uuid, public.party_role, text) from public, anon;
revoke all on function public.save_party_preset(text, text, smallint, jsonb) from public, anon;
grant execute on function public.list_joinable_guilds(text) to authenticated;
grant execute on function public.guild_join_code_set() to authenticated;
grant execute on function public.add_roster_member(uuid, public.party_role, text) to authenticated;
grant execute on function public.save_party_preset(text, text, smallint, jsonb) to authenticated;
