-- =====================================================================
-- AION 2 Guild Command — 0003 RPC functions for multi-step operations
-- Run after 0002.
--
-- Multi-table operations (create/join guild, claim character, join code)
-- run as SECURITY DEFINER functions that validate the caller themselves,
-- so clients never need INSERT rights on memberships/ownerships.
--
-- Functions that write AION 2 API data (characters, snapshots) are granted
-- to service_role ONLY: that data must come from the Next.js server after
-- it called the AION 2 API, never from a browser.
-- =====================================================================

-- ---------------------------------------------------------------------
-- create_guild — caller becomes Guild Leader and first roster member.
-- ---------------------------------------------------------------------
create or replace function public.create_guild(
  p_name text,
  p_server text default '',
  p_description text default '',
  p_join_code text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_guild uuid;
  v_char uuid;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  if p_join_code is not null and p_join_code !~ '^\d{4}$' then
    raise exception 'INVALID_JOIN_CODE: The join code must be exactly 4 digits.' using errcode = '22023';
  end if;
  -- Serialize per account to avoid double-creates.
  perform 1 from public.profiles p where p.id = v_uid for update;
  if exists (select 1 from public.guild_memberships m where m.user_id = v_uid) then
    raise exception 'ALREADY_IN_GUILD: You already belong to a guild.' using errcode = 'P0001';
  end if;

  select o.character_id into v_char from public.character_ownerships o where o.user_id = v_uid;
  if v_char is not null and exists (select 1 from public.guild_roster_members r where r.character_id = v_char) then
    raise exception 'CHARACTER_IN_GUILD: Your character is already in another guild''s roster.' using errcode = 'P0001';
  end if;

  insert into public.guilds (name, server, description, leader_user_id)
  values (btrim(p_name), btrim(coalesce(p_server, '')), coalesce(p_description, ''), v_uid)
  returning id into v_guild;

  insert into public.guild_memberships (user_id, guild_id, role) values (v_uid, v_guild, 'leader');

  if v_char is not null then
    insert into public.guild_roster_members (guild_id, character_id, added_by) values (v_guild, v_char, v_uid);
  end if;

  if p_join_code is not null then
    update public.guild_secrets
       set join_code_hash = extensions.crypt(p_join_code, extensions.gen_salt('bf'))
     where guild_id = v_guild;
  end if;

  perform public.write_audit(v_guild, 'guild.create', jsonb_build_object('name', btrim(p_name)));
  return v_guild;
end $$;

-- ---------------------------------------------------------------------
-- set_join_code — Guild Leader only; null closes joining.
-- ---------------------------------------------------------------------
create or replace function public.set_join_code(p_code text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_guild uuid := public.current_guild_id();
begin
  if v_guild is null or not public.is_guild_leader(v_guild) then
    raise exception 'LEADER_ONLY: Only the Guild Leader can do this.' using errcode = '42501';
  end if;
  if p_code is not null and p_code !~ '^\d{4}$' then
    raise exception 'INVALID_JOIN_CODE: The join code must be exactly 4 digits.' using errcode = '22023';
  end if;
  update public.guild_secrets
     set join_code_hash = case when p_code is null then null else extensions.crypt(p_code, extensions.gen_salt('bf')) end
   where guild_id = v_guild;
  perform public.write_audit(v_guild, 'guild.join_code', jsonb_build_object('set', p_code is not null));
  return p_code is not null;
end $$;

-- ---------------------------------------------------------------------
-- join_guild — join with the 4-digit code.
-- Returns a status instead of raising for expected failures, so the
-- attempt row (rate limit: 5 per 10 minutes) is committed.
--   'ok' | 'rate_limited' | 'not_found' | 'closed' | 'invalid_code'
--   | 'already_in_guild' | 'character_in_other_guild' | 'guild_full'
-- ---------------------------------------------------------------------
create or replace function public.join_guild(p_guild uuid, p_code text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_char uuid;
  v_char_guild uuid;
  v_cap integer;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  perform 1 from public.profiles p where p.id = v_uid for update;

  if (select count(*) from public.guild_join_attempts a
       where a.user_id = v_uid and not a.succeeded and a.attempted_at > now() - interval '10 minutes') >= 5 then
    return 'rate_limited';
  end if;
  if exists (select 1 from public.guild_memberships m where m.user_id = v_uid) then
    return 'already_in_guild';
  end if;

  select s.join_code_hash into v_hash from public.guild_secrets s where s.guild_id = p_guild;
  if not found then return 'not_found'; end if;
  if v_hash is null then return 'closed'; end if;

  if p_code is null or p_code !~ '^\d{4}$' or extensions.crypt(p_code, v_hash) <> v_hash then
    insert into public.guild_join_attempts (user_id, guild_id, succeeded) values (v_uid, p_guild, false);
    return 'invalid_code';
  end if;

  select o.character_id into v_char from public.character_ownerships o where o.user_id = v_uid;
  if v_char is not null then
    select r.guild_id into v_char_guild from public.guild_roster_members r where r.character_id = v_char;
    if v_char_guild is not null and v_char_guild <> p_guild then
      return 'character_in_other_guild';
    end if;
    if v_char_guild is null then
      select g.member_cap into v_cap from public.guilds g where g.id = p_guild for update;
      if (select count(*) from public.guild_roster_members r where r.guild_id = p_guild) >= v_cap then
        return 'guild_full';
      end if;
      insert into public.guild_roster_members (guild_id, character_id, added_by) values (p_guild, v_char, v_uid);
    end if;
  end if;

  insert into public.guild_memberships (user_id, guild_id, role) values (v_uid, p_guild, 'member');
  insert into public.guild_join_attempts (user_id, guild_id, succeeded) values (v_uid, p_guild, true);
  perform public.write_audit(p_guild, 'guild.join', jsonb_build_object('user_id', v_uid));
  return 'ok';
end $$;

-- ---------------------------------------------------------------------
-- claim_character — link the caller's account to an AION 2 character.
-- The character row must already exist (written by the server from the
-- API — proves the character exists). One owner per character, one
-- character per account. If a guild roster already contains it, the
-- account joins that guild (no duplicate roster record).
-- ---------------------------------------------------------------------
create or replace function public.claim_character(p_character uuid)
returns uuid  -- guild joined through the roster link, or null
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_guild uuid;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  perform 1 from public.profiles p where p.id = v_uid for update;
  if not exists (select 1 from public.characters c where c.id = p_character) then
    raise exception 'CHARACTER_NOT_FOUND: Character not found.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.character_ownerships o where o.user_id = v_uid) then
    raise exception 'ALREADY_HAS_CHARACTER: This account already has a character.' using errcode = 'P0001';
  end if;
  begin
    insert into public.character_ownerships (character_id, user_id) values (p_character, v_uid);
  exception when unique_violation then
    raise exception 'CHARACTER_TAKEN: This character is already registered to another account.' using errcode = 'P0001';
  end;

  select r.guild_id into v_guild from public.guild_roster_members r where r.character_id = p_character;
  if v_guild is not null and not exists (select 1 from public.guild_memberships m where m.user_id = v_uid) then
    insert into public.guild_memberships (user_id, guild_id, role) values (v_uid, v_guild, 'member');
    perform public.write_audit(v_guild, 'guild.link_account', jsonb_build_object('user_id', v_uid, 'character_id', p_character));
    return v_guild;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- guild_data_overview — counts for Settings → Data Management (any member).
-- ---------------------------------------------------------------------
create or replace function public.guild_data_overview()
returns table (
  roster_members bigint,
  linked_accounts bigint,
  snapshots bigint,
  party_presets bigint
)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*) from public.guild_roster_members r where r.guild_id = g.id),
    (select count(*) from public.guild_memberships m where m.guild_id = g.id),
    (select count(*) from public.character_snapshots s where s.guild_id = g.id),
    (select count(*) from public.party_presets p where p.guild_id = g.id)
  from public.guilds g
  where g.id = public.current_guild_id()
$$;

-- ---------------------------------------------------------------------
-- SERVER-ONLY (service_role): API data writes.
-- ---------------------------------------------------------------------
create or replace function public.upsert_character_from_api(
  p_region text,
  p_server_id text,
  p_character_id text,
  p_character_name text,
  p_class_name text,
  p_level integer,
  p_combat_power bigint,
  p_item_level numeric,
  p_server_name text,
  p_profile_image text,
  p_api_raw jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.characters as c (
    region, server_id, character_id, character_name, class_name, level, combat_power,
    item_level, server_name, profile_image, api_raw, api_updated_at, last_refresh_error
  ) values (
    p_region, p_server_id, p_character_id, p_character_name, p_class_name, p_level, p_combat_power,
    p_item_level, p_server_name, p_profile_image, p_api_raw, now(), null
  )
  on conflict (region, server_id, character_id) do update set
    character_name = excluded.character_name,
    class_name = excluded.class_name,
    level = excluded.level,
    combat_power = excluded.combat_power,
    item_level = excluded.item_level,
    server_name = excluded.server_name,
    profile_image = excluded.profile_image,
    api_raw = excluded.api_raw,
    api_updated_at = now(),
    last_refresh_error = null
  returning c.id into v_id;
  return v_id;
end $$;

-- Failed refresh: keep the data, record the error.
create or replace function public.record_character_refresh_error(p_character uuid, p_status integer, p_message text)
returns void
language sql security definer set search_path = '' as $$
  update public.characters
     set last_refresh_error = jsonb_build_object('at', now(), 'status', p_status, 'message', left(p_message, 500))
   where id = p_character
$$;

-- Snapshot + equipment rows in one call.
-- p_equipment: [{ "slot", "name", "enchant", "exceed", "grade" }, …]
create or replace function public.record_character_snapshot(
  p_roster_member uuid,
  p_captured_at timestamptz,
  p_level integer,
  p_combat_power bigint,
  p_item_level numeric,
  p_equipment jsonb
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_guild uuid;
  v_char uuid;
  v_snap bigint;
begin
  select r.guild_id, r.character_id into v_guild, v_char from public.guild_roster_members r where r.id = p_roster_member;
  if v_guild is null then raise exception 'Roster entry not found.' using errcode = 'P0002'; end if;

  insert into public.character_snapshots (guild_id, roster_member_id, character_id, captured_at, level, combat_power, item_level)
  values (v_guild, p_roster_member, v_char, p_captured_at, p_level, p_combat_power, p_item_level)
  returning id into v_snap;

  insert into public.character_snapshot_equipment (snapshot_id, position, slot, name, enchant, exceed, grade)
  select v_snap, (e.ord - 1)::smallint, e.item->>'slot', e.item->>'name',
         (e.item->>'enchant')::integer, (e.item->>'exceed')::integer, e.item->>'grade'
  from jsonb_array_elements(coalesce(p_equipment, '[]'::jsonb)) with ordinality as e(item, ord);

  return v_snap;
end $$;

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
revoke all on function public.create_guild(text, text, text, text) from public, anon;
revoke all on function public.set_join_code(text) from public, anon;
revoke all on function public.join_guild(uuid, text) from public, anon;
revoke all on function public.claim_character(uuid) from public, anon;
revoke all on function public.guild_data_overview() from public, anon;
grant execute on function public.create_guild(text, text, text, text) to authenticated;
grant execute on function public.set_join_code(text) to authenticated;
grant execute on function public.join_guild(uuid, text) to authenticated;
grant execute on function public.claim_character(uuid) to authenticated;
grant execute on function public.guild_data_overview() to authenticated;

revoke all on function public.upsert_character_from_api(text, text, text, text, text, integer, bigint, numeric, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.record_character_refresh_error(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.record_character_snapshot(uuid, timestamptz, integer, bigint, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_character_from_api(text, text, text, text, text, integer, bigint, numeric, text, text, jsonb) to service_role;
grant execute on function public.record_character_refresh_error(uuid, integer, text) to service_role;
grant execute on function public.record_character_snapshot(uuid, timestamptz, integer, bigint, numeric, jsonb) to service_role;

-- Trigger-only functions must not be callable directly.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.on_guild_created() from public, anon, authenticated;
revoke all on function public.enforce_member_cap() from public, anon, authenticated;
revoke all on function public.roster_before_delete() from public, anon, authenticated;
revoke all on function public.roster_after_delete() from public, anon, authenticated;
revoke all on function public.membership_before_delete() from public, anon, authenticated;
revoke all on function public.prune_snapshots() from public, anon, authenticated;
revoke all on function public.snapshot_check_character() from public, anon, authenticated;
revoke all on function public.enforce_preset_limit() from public, anon, authenticated;
revoke all on function public.slot_check_position() from public, anon, authenticated;
