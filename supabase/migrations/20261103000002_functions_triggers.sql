-- =====================================================================
-- AION 2 Guild Command — 0002 helper functions and triggers
-- Run after 0001.
-- =====================================================================

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'guilds', 'guild_settings', 'characters', 'guild_roster_members', 'party_presets', 'guild_secrets'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- New Supabase Auth user → profile row
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Permission helpers used by RLS. SECURITY DEFINER so policies on
-- guild_memberships can call them without recursive RLS evaluation.
-- ---------------------------------------------------------------------
create or replace function public.current_guild_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.guild_id from public.guild_memberships m where m.user_id = (select auth.uid())
$$;

create or replace function public.is_guild_member(p_guild uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.guild_memberships m
    where m.user_id = (select auth.uid()) and m.guild_id = p_guild
  )
$$;

create or replace function public.is_guild_leader(p_guild uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.guild_memberships m
    where m.user_id = (select auth.uid()) and m.guild_id = p_guild and m.role = 'leader'
  )
$$;

revoke all on function public.current_guild_id() from public, anon;
revoke all on function public.is_guild_member(uuid) from public, anon;
revoke all on function public.is_guild_leader(uuid) from public, anon;
grant execute on function public.current_guild_id() to authenticated;
grant execute on function public.is_guild_member(uuid) to authenticated;
grant execute on function public.is_guild_leader(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Audit helper (internal)
-- ---------------------------------------------------------------------
create or replace function public.write_audit(p_guild uuid, p_action text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.guild_audit_log (guild_id, actor_id, action, details)
  values (p_guild, auth.uid(), p_action, coalesce(p_details, '{}'::jsonb))
$$;
revoke all on function public.write_audit(uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- New guild → default settings + secrets rows
-- ---------------------------------------------------------------------
create or replace function public.on_guild_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.guild_settings (guild_id) values (new.id) on conflict do nothing;
  insert into public.guild_secrets (guild_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists guilds_after_insert on public.guilds;
create trigger guilds_after_insert after insert on public.guilds
  for each row execute function public.on_guild_created();

-- ---------------------------------------------------------------------
-- Roster: member cap (server-side, race-safe via guild row lock)
-- ---------------------------------------------------------------------
create or replace function public.enforce_member_cap()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_cap integer;
  v_count integer;
begin
  select g.member_cap into v_cap from public.guilds g where g.id = new.guild_id for update;
  if v_cap is null then
    raise exception 'Guild not found.' using errcode = 'P0002';
  end if;
  select count(*) into v_count from public.guild_roster_members r where r.guild_id = new.guild_id;
  if v_count >= v_cap then
    raise exception 'MEMBER_CAP: The guild is full (% members).', v_cap using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists roster_enforce_cap on public.guild_roster_members;
create trigger roster_enforce_cap before insert on public.guild_roster_members
  for each row execute function public.enforce_member_cap();

-- A roster entry may not be moved to another guild or character by UPDATE.
create or replace function public.roster_lock_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.guild_id <> old.guild_id or new.character_id <> old.character_id or new.added_at <> old.added_at then
    raise exception 'Roster identity fields cannot be changed.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists roster_lock_identity on public.guild_roster_members;
create trigger roster_lock_identity before update on public.guild_roster_members
  for each row execute function public.roster_lock_identity();

-- ---------------------------------------------------------------------
-- Roster removal rules (same as the JSON version):
--  * the leader's own character record cannot be removed;
--  * removing a member whose owner account is in this guild removes that
--    account's guild membership (it is sent back to guild setup).
-- Skipped while the whole guild is being deleted (cascade).
-- ---------------------------------------------------------------------
create or replace function public.roster_before_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_leader uuid;
begin
  select g.leader_user_id into v_leader from public.guilds g where g.id = old.guild_id;
  if not found then return old; end if;  -- guild deletion cascade
  if v_leader is not null and exists (
    select 1 from public.character_ownerships o where o.character_id = old.character_id and o.user_id = v_leader
  ) then
    raise exception 'LEADER_SELF: The Guild Leader''s own character cannot be removed.' using errcode = '42501';
  end if;
  return old;
end $$;

create or replace function public.roster_after_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if not exists (select 1 from public.guilds g where g.id = old.guild_id) then return old; end if;
  select o.user_id into v_owner from public.character_ownerships o where o.character_id = old.character_id;
  if v_owner is not null then
    delete from public.guild_memberships m
    where m.user_id = v_owner and m.guild_id = old.guild_id and m.role = 'member';
  end if;
  perform public.write_audit(old.guild_id, 'roster.remove', jsonb_build_object('roster_member_id', old.id, 'character_id', old.character_id));
  return old;
end $$;

drop trigger if exists roster_before_delete on public.guild_roster_members;
create trigger roster_before_delete before delete on public.guild_roster_members
  for each row execute function public.roster_before_delete();
drop trigger if exists roster_after_delete on public.guild_roster_members;
create trigger roster_after_delete after delete on public.guild_roster_members
  for each row execute function public.roster_after_delete();

-- ---------------------------------------------------------------------
-- Memberships: the leader row can only go away with the guild.
-- ---------------------------------------------------------------------
create or replace function public.membership_before_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'leader' and exists (select 1 from public.guilds g where g.id = old.guild_id) then
    raise exception 'The Guild Leader cannot leave or be removed. Transfer leadership first.' using errcode = '42501';
  end if;
  return old;
end $$;

drop trigger if exists membership_before_delete on public.guild_memberships;
create trigger membership_before_delete before delete on public.guild_memberships
  for each row execute function public.membership_before_delete();

-- ---------------------------------------------------------------------
-- Snapshots: keep the newest 200 per roster entry (MAX_SNAPSHOTS).
-- ---------------------------------------------------------------------
create or replace function public.prune_snapshots()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.character_snapshots s
  where s.roster_member_id = new.roster_member_id
    and s.id not in (
      select s2.id from public.character_snapshots s2
      where s2.roster_member_id = new.roster_member_id
      order by s2.captured_at desc, s2.id desc
      limit 200
    );
  return null;
end $$;

drop trigger if exists snapshots_prune on public.character_snapshots;
create trigger snapshots_prune after insert on public.character_snapshots
  for each row execute function public.prune_snapshots();

-- Snapshot must belong to the roster entry's character.
create or replace function public.snapshot_check_character()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.guild_roster_members r
    where r.id = new.roster_member_id and r.guild_id = new.guild_id and r.character_id = new.character_id
  ) then
    raise exception 'Snapshot does not match the roster entry.' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists snapshots_check_character on public.character_snapshots;
create trigger snapshots_check_character before insert on public.character_snapshots
  for each row execute function public.snapshot_check_character();

-- ---------------------------------------------------------------------
-- Party presets: at most 50 per guild; slot positions within slot_count.
-- ---------------------------------------------------------------------
create or replace function public.enforce_preset_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.guilds g where g.id = new.guild_id for update;
  if (select count(*) from public.party_presets p where p.guild_id = new.guild_id) >= 50 then
    raise exception 'A guild can have at most 50 party presets.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists presets_enforce_limit on public.party_presets;
create trigger presets_enforce_limit before insert on public.party_presets
  for each row execute function public.enforce_preset_limit();

create or replace function public.preset_lock_guild()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.guild_id <> old.guild_id then
    raise exception 'A preset cannot be moved to another guild.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists presets_lock_guild on public.party_presets;
create trigger presets_lock_guild before update on public.party_presets
  for each row execute function public.preset_lock_guild();

create or replace function public.slot_check_position()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_count smallint;
begin
  select p.slot_count into v_count from public.party_presets p where p.id = new.preset_id and p.guild_id = new.guild_id;
  if v_count is null or new.position >= v_count then
    raise exception 'Slot position is outside the preset size.' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists slots_check_position on public.party_preset_slots;
create trigger slots_check_position before insert or update on public.party_preset_slots
  for each row execute function public.slot_check_position();
