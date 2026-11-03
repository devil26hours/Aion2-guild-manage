-- =====================================================================
-- AION 2 Guild Command — 0004 Row Level Security + table privileges
-- Run after 0003.
--
-- Model:
--  * anon: no table access at all.
--  * Guild Member: read their own guild's data; no writes to guild data.
--  * Guild Leader: manage their own guild (settings, roster, presets).
--  * Ownership / membership rows are only created by the RPCs in 0003.
--  * API-owned data (characters, snapshots) is written by service_role only.
--  * Column-level UPDATE grants stop identity / permission columns from
--    being changed even where a row is updatable.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enable RLS everywhere (no policy = no access for anon/authenticated)
-- ---------------------------------------------------------------------
alter table public.profiles                     enable row level security;
alter table public.guilds                       enable row level security;
alter table public.guild_secrets                enable row level security;
alter table public.guild_join_attempts          enable row level security;
alter table public.guild_settings               enable row level security;
alter table public.guild_memberships            enable row level security;
alter table public.characters                   enable row level security;
alter table public.character_ownerships         enable row level security;
alter table public.guild_roster_members         enable row level security;
alter table public.character_snapshots          enable row level security;
alter table public.character_snapshot_equipment enable row level security;
alter table public.party_presets                enable row level security;
alter table public.party_preset_slots           enable row level security;
alter table public.guild_audit_log              enable row level security;

-- ---------------------------------------------------------------------
-- Baseline privileges: start from nothing, then grant precisely.
-- ---------------------------------------------------------------------
revoke all on
  public.profiles, public.guilds, public.guild_secrets, public.guild_join_attempts,
  public.guild_settings, public.guild_memberships, public.characters,
  public.character_ownerships, public.guild_roster_members, public.character_snapshots,
  public.character_snapshot_equipment, public.party_presets, public.party_preset_slots,
  public.guild_audit_log
from anon, authenticated;

grant select on
  public.profiles, public.guilds, public.guild_settings, public.guild_memberships,
  public.characters, public.character_ownerships, public.guild_roster_members,
  public.character_snapshots, public.character_snapshot_equipment,
  public.party_presets, public.party_preset_slots, public.guild_audit_log
to authenticated;

-- Column-limited updates
grant update (display_name) on public.profiles to authenticated;
grant update (name, server, description, leader_label, member_cap,
              image_path, image_content_type, image_size, image_uploaded_at) on public.guilds to authenticated;
grant update (admin_display_name, admin_email, admin_title, admin_bio, default_sort, party_view,
              show_top_members, show_class_distribution, show_recent_updates, show_quick_actions,
              recent_updates_count) on public.guild_settings to authenticated;
grant insert (guild_id, character_id, role, notes, added_by) on public.guild_roster_members to authenticated;
grant update (role, notes) on public.guild_roster_members to authenticated;
grant delete on public.guild_roster_members to authenticated;
grant delete on public.guild_memberships to authenticated;
grant insert (guild_id, legacy_id, name, slot_count, created_by) on public.party_presets to authenticated;
grant update (name, slot_count) on public.party_presets to authenticated;
grant delete on public.party_presets to authenticated;
grant insert, update (roster_member_id, role), delete on public.party_preset_slots to authenticated;
-- guild_secrets, guild_join_attempts: no grants (RPC only).

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.guild_memberships m
      where m.user_id = profiles.id and m.guild_id = (select public.current_guild_id())
    )
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- guilds — any signed-in user can browse guilds (join flow); only the
-- Guild Leader can edit their guild (columns limited above).
-- Create/delete: RPC only (no policy).
-- ---------------------------------------------------------------------
drop policy if exists guilds_select on public.guilds;
create policy guilds_select on public.guilds for select to authenticated using (true);

drop policy if exists guilds_update_leader on public.guilds;
create policy guilds_update_leader on public.guilds for update to authenticated
  using ((select public.is_guild_leader(id)))
  with check ((select public.is_guild_leader(id)));

-- ---------------------------------------------------------------------
-- guild_settings
-- ---------------------------------------------------------------------
drop policy if exists guild_settings_select on public.guild_settings;
create policy guild_settings_select on public.guild_settings for select to authenticated
  using ((select public.is_guild_member(guild_id)));

drop policy if exists guild_settings_update_leader on public.guild_settings;
create policy guild_settings_update_leader on public.guild_settings for update to authenticated
  using ((select public.is_guild_leader(guild_id)))
  with check ((select public.is_guild_leader(guild_id)));

-- ---------------------------------------------------------------------
-- guild_memberships — members see their guild's list; the leader can
-- remove (kick) members; the leader row is protected by trigger.
-- Insert/update: RPC only.
-- ---------------------------------------------------------------------
drop policy if exists memberships_select on public.guild_memberships;
create policy memberships_select on public.guild_memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_guild_member(guild_id)));

drop policy if exists memberships_delete_leader on public.guild_memberships;
create policy memberships_delete_leader on public.guild_memberships for delete to authenticated
  using (role = 'member' and (select public.is_guild_leader(guild_id)));

-- ---------------------------------------------------------------------
-- characters — readable when owned by the caller or on the caller's
-- guild roster. No client writes (service_role functions only).
-- ---------------------------------------------------------------------
drop policy if exists characters_select on public.characters;
create policy characters_select on public.characters for select to authenticated
  using (
    exists (select 1 from public.character_ownerships o where o.character_id = characters.id and o.user_id = (select auth.uid()))
    or exists (
      select 1 from public.guild_roster_members r
      where r.character_id = characters.id and r.guild_id = (select public.current_guild_id())
    )
  );

-- ---------------------------------------------------------------------
-- character_ownerships — own row, plus ownerships of guild-mates
-- (to show which roster members are linked accounts). Writes: RPC only.
-- ---------------------------------------------------------------------
drop policy if exists ownerships_select on public.character_ownerships;
create policy ownerships_select on public.character_ownerships for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.guild_roster_members r
      where r.character_id = character_ownerships.character_id and r.guild_id = (select public.current_guild_id())
    )
  );

-- ---------------------------------------------------------------------
-- guild_roster_members
-- ---------------------------------------------------------------------
drop policy if exists roster_select on public.guild_roster_members;
create policy roster_select on public.guild_roster_members for select to authenticated
  using ((select public.is_guild_member(guild_id)));

drop policy if exists roster_insert_leader on public.guild_roster_members;
create policy roster_insert_leader on public.guild_roster_members for insert to authenticated
  with check ((select public.is_guild_leader(guild_id)) and (added_by is null or added_by = (select auth.uid())));

drop policy if exists roster_update_leader on public.guild_roster_members;
create policy roster_update_leader on public.guild_roster_members for update to authenticated
  using ((select public.is_guild_leader(guild_id)))
  with check ((select public.is_guild_leader(guild_id)));

drop policy if exists roster_delete_leader on public.guild_roster_members;
create policy roster_delete_leader on public.guild_roster_members for delete to authenticated
  using ((select public.is_guild_leader(guild_id)));

-- ---------------------------------------------------------------------
-- Snapshots — read-only for guild members (written by service_role).
-- ---------------------------------------------------------------------
drop policy if exists snapshots_select on public.character_snapshots;
create policy snapshots_select on public.character_snapshots for select to authenticated
  using ((select public.is_guild_member(guild_id)));

drop policy if exists snapshot_equipment_select on public.character_snapshot_equipment;
create policy snapshot_equipment_select on public.character_snapshot_equipment for select to authenticated
  using (exists (
    select 1 from public.character_snapshots s
    where s.id = character_snapshot_equipment.snapshot_id and (select public.is_guild_member(s.guild_id))
  ));

-- ---------------------------------------------------------------------
-- Party presets + slots — members read, leader manages.
-- ---------------------------------------------------------------------
drop policy if exists presets_select on public.party_presets;
create policy presets_select on public.party_presets for select to authenticated
  using ((select public.is_guild_member(guild_id)));

drop policy if exists presets_insert_leader on public.party_presets;
create policy presets_insert_leader on public.party_presets for insert to authenticated
  with check ((select public.is_guild_leader(guild_id)) and (created_by is null or created_by = (select auth.uid())));

drop policy if exists presets_update_leader on public.party_presets;
create policy presets_update_leader on public.party_presets for update to authenticated
  using ((select public.is_guild_leader(guild_id)))
  with check ((select public.is_guild_leader(guild_id)));

drop policy if exists presets_delete_leader on public.party_presets;
create policy presets_delete_leader on public.party_presets for delete to authenticated
  using ((select public.is_guild_leader(guild_id)));

drop policy if exists slots_select on public.party_preset_slots;
create policy slots_select on public.party_preset_slots for select to authenticated
  using ((select public.is_guild_member(guild_id)));

drop policy if exists slots_insert_leader on public.party_preset_slots;
create policy slots_insert_leader on public.party_preset_slots for insert to authenticated
  with check ((select public.is_guild_leader(guild_id)));

drop policy if exists slots_update_leader on public.party_preset_slots;
create policy slots_update_leader on public.party_preset_slots for update to authenticated
  using ((select public.is_guild_leader(guild_id)))
  with check ((select public.is_guild_leader(guild_id)));

drop policy if exists slots_delete_leader on public.party_preset_slots;
create policy slots_delete_leader on public.party_preset_slots for delete to authenticated
  using ((select public.is_guild_leader(guild_id)));

-- ---------------------------------------------------------------------
-- Audit log — Guild Leader reads their guild's log. Writes: definer only.
-- ---------------------------------------------------------------------
drop policy if exists audit_select_leader on public.guild_audit_log;
create policy audit_select_leader on public.guild_audit_log for select to authenticated
  using ((select public.is_guild_leader(guild_id)));
