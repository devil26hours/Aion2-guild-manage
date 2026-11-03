-- =====================================================================
-- AION 2 Guild Command — 0001 core schema
-- Review, then run manually in Supabase Dashboard → SQL Editor (in order).
-- Passwords are NEVER stored here: authentication is Supabase Auth.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.guild_role as enum ('leader', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Planning labels set by the Guild Leader (src/lib/party/types.ts PARTY_ROLES).
  create type public.party_role as enum ('Tank', 'Healer', 'Support', 'DPS');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- profiles — one row per Supabase Auth user (created by trigger, 0002).
-- Email stays in auth.users (not copied here, so guild-mates can't read it).
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  display_name    text check (display_name is null or char_length(display_name) between 1 and 24),
  -- JSON account id (users.json "u-…") kept for the one-time data migration.
  legacy_user_id  text unique check (legacy_user_id is null or legacy_user_id ~ '^u-[a-z0-9]{6,40}$'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- guilds — public guild info (listed for joining). Join code lives in
-- guild_secrets (no client access at all).
-- ---------------------------------------------------------------------
create table if not exists public.guilds (
  id                  uuid primary key default gen_random_uuid(),
  legacy_guild_id     text unique check (legacy_guild_id is null or legacy_guild_id ~ '^g-[a-z0-9]{6,40}$'),
  name                text not null check (char_length(btrim(name)) between 2 and 40),
  server              text not null default '' check (char_length(server) <= 40),
  description         text not null default '' check (char_length(description) <= 300),
  -- Free-text "Guild leader character" shown in settings (settings.guild.leader).
  leader_label        text not null default '' check (char_length(leader_label) <= 24),
  member_cap          integer not null default 60 check (member_cap between 1 and 999),
  -- Account that leads the guild (authoritative for permissions). One guild per leader.
  leader_user_id      uuid unique references public.profiles (id) on delete set null,
  -- Guild image in Storage bucket "guild-images" (object path "<guild id>/<file>").
  image_path          text check (image_path is null or image_path ~ '^[0-9a-f-]{36}/guild-[0-9a-z]{6,20}-[0-9a-f]{16}\.(png|jpg)$'),
  image_content_type  text check (image_content_type is null or image_content_type in ('image/png', 'image/jpeg')),
  image_size          integer check (image_size is null or image_size between 1 and 1048576),
  image_uploaded_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint guilds_image_complete check (
    (image_path is null and image_content_type is null and image_size is null and image_uploaded_at is null)
    or (image_path is not null and image_content_type is not null and image_size is not null and image_uploaded_at is not null)
  )
);
create index if not exists guilds_name_lower_idx on public.guilds (lower(name));

create table if not exists public.guild_secrets (
  guild_id        uuid primary key references public.guilds (id) on delete cascade,
  -- bcrypt hash (extensions.crypt) of the 4-digit join code; null = joining closed.
  join_code_hash  text,
  updated_at      timestamptz not null default now()
);

-- Join-code attempts for server-side rate limiting (5 per 10 minutes per account).
create table if not exists public.guild_join_attempts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  guild_id      uuid references public.guilds (id) on delete cascade,
  succeeded     boolean not null,
  attempted_at  timestamptz not null default now()
);
create index if not exists guild_join_attempts_user_time_idx on public.guild_join_attempts (user_id, attempted_at desc);

-- ---------------------------------------------------------------------
-- guild_settings — per-guild admin profile + preferences (settings.admin/prefs).
-- ---------------------------------------------------------------------
create table if not exists public.guild_settings (
  guild_id                 uuid primary key references public.guilds (id) on delete cascade,
  admin_display_name       text not null default 'Guild Admin' check (char_length(btrim(admin_display_name)) between 1 and 24),
  admin_email              text not null default 'admin@guild.local' check (char_length(admin_email) <= 120 and admin_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  admin_title              text not null default 'Guild Leader' check (char_length(admin_title) <= 40),
  admin_bio                text not null default '' check (char_length(admin_bio) <= 300),
  default_sort             text not null default 'combat_power:desc' check (default_sort in (
                             'combat_power:desc', 'combat_power:asc', 'item_level:desc',
                             'item_level:asc', 'level:desc', 'level:asc')),
  party_view               text not null default 'cards' check (party_view in ('cards', 'list')),
  show_top_members         boolean not null default true,
  show_class_distribution  boolean not null default true,
  show_recent_updates      boolean not null default true,
  show_quick_actions       boolean not null default true,
  recent_updates_count     smallint not null default 8 check (recent_updates_count in (5, 8, 10)),
  updated_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- guild_memberships — ACCOUNT ↔ guild. PK on user_id: one guild per account.
-- ---------------------------------------------------------------------
create table if not exists public.guild_memberships (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  guild_id   uuid not null references public.guilds (id) on delete cascade,
  role       public.guild_role not null default 'member',
  joined_at  timestamptz not null default now()
);
create index if not exists guild_memberships_guild_idx on public.guild_memberships (guild_id);
create unique index if not exists guild_memberships_one_leader_idx on public.guild_memberships (guild_id) where role = 'leader';

-- ---------------------------------------------------------------------
-- characters — AION 2 character data as returned by the API (API-owned).
-- Identity: (region, server_id, character_id) — the JSON "region:server:char" id.
-- Written only by server-side code (see 0003: service_role functions).
-- ---------------------------------------------------------------------
create table if not exists public.characters (
  id                  uuid primary key default gen_random_uuid(),
  region              text not null check (region in ('nae', 'naw', 'eu', 'la', 'as')),
  server_id           text not null check (server_id ~ '^\d{3,6}$'),
  character_id        text not null check (character_id ~ '^[A-Za-z0-9_\-=+/]{8,128}$'),
  character_name      text not null check (char_length(character_name) between 1 and 64),
  class_name          text,
  level               integer,
  combat_power        bigint,
  item_level          numeric,
  server_name         text,
  profile_image       text,
  api_raw             jsonb,              -- original API response, unmodified (incl. current equipment)
  api_updated_at      timestamptz,        -- last SUCCESSFUL API update
  last_refresh_error  jsonb,              -- { at, status, message } or null
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint characters_identity_key unique (region, server_id, character_id)
);
create index if not exists characters_name_lower_idx on public.characters (lower(character_name));

-- ---------------------------------------------------------------------
-- character_ownerships — ACCOUNT ↔ character (separate from guild roster).
-- PK character_id: a character belongs to at most one account.
-- UNIQUE user_id: one character per account (current app rule).
-- ---------------------------------------------------------------------
create table if not exists public.character_ownerships (
  character_id  uuid primary key references public.characters (id) on delete cascade,
  user_id       uuid not null unique references public.profiles (id) on delete cascade,
  claimed_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- guild_roster_members — CHARACTER ↔ guild roster (manual guild data).
-- UNIQUE character_id: a character is in at most one guild at a time.
-- ---------------------------------------------------------------------
create table if not exists public.guild_roster_members (
  id            uuid primary key default gen_random_uuid(),
  guild_id      uuid not null references public.guilds (id) on delete cascade,
  character_id  uuid not null unique references public.characters (id) on delete restrict,
  role          public.party_role,
  notes         text not null default '' check (char_length(notes) <= 300),
  added_by      uuid references public.profiles (id) on delete set null,
  added_at      timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint guild_roster_members_guild_id_id_key unique (guild_id, id)
);
create index if not exists guild_roster_members_guild_idx on public.guild_roster_members (guild_id);

-- ---------------------------------------------------------------------
-- character_snapshots — history captured on add/refresh (per roster entry,
-- removed with it, like the JSON "snapshots" array). Max 200 kept (0002).
-- ---------------------------------------------------------------------
create table if not exists public.character_snapshots (
  id                bigint generated always as identity primary key,
  guild_id          uuid not null,
  roster_member_id  uuid not null,
  character_id      uuid not null references public.characters (id) on delete cascade,
  captured_at       timestamptz not null,
  level             integer,
  combat_power      bigint,
  item_level        numeric,
  created_at        timestamptz not null default now(),
  constraint character_snapshots_roster_fk foreign key (guild_id, roster_member_id)
    references public.guild_roster_members (guild_id, id) on delete cascade
);
create index if not exists character_snapshots_member_time_idx on public.character_snapshots (roster_member_id, captured_at desc);
create index if not exists character_snapshots_guild_time_idx on public.character_snapshots (guild_id, captured_at desc);

create table if not exists public.character_snapshot_equipment (
  snapshot_id  bigint not null references public.character_snapshots (id) on delete cascade,
  position     smallint not null check (position >= 0),
  slot         text not null,
  name         text not null,
  enchant      integer,
  exceed       integer,
  grade        text,
  primary key (snapshot_id, position)
);

-- ---------------------------------------------------------------------
-- party_presets / party_preset_slots — Party Builder (party-presets.json).
-- ---------------------------------------------------------------------
create table if not exists public.party_presets (
  id          uuid primary key default gen_random_uuid(),
  guild_id    uuid not null references public.guilds (id) on delete cascade,
  legacy_id   text check (legacy_id is null or legacy_id ~ '^p-[a-z0-9-]{3,40}$'),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  slot_count  smallint not null check (slot_count between 2 and 10),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint party_presets_guild_id_id_key unique (guild_id, id)
);
create unique index if not exists party_presets_guild_name_idx on public.party_presets (guild_id, lower(btrim(name)));
create unique index if not exists party_presets_guild_legacy_idx on public.party_presets (guild_id, legacy_id) where legacy_id is not null;

create table if not exists public.party_preset_slots (
  guild_id          uuid not null,
  preset_id         uuid not null,
  position          smallint not null check (position between 0 and 9),
  -- Roster entry in the SAME guild (composite FK). Removing the member empties the slot.
  roster_member_id  uuid,
  role              public.party_role,
  primary key (preset_id, position),
  constraint party_preset_slots_preset_fk foreign key (guild_id, preset_id)
    references public.party_presets (guild_id, id) on delete cascade,
  constraint party_preset_slots_member_fk foreign key (guild_id, roster_member_id)
    references public.guild_roster_members (guild_id, id) on delete set null (roster_member_id)
);
create index if not exists party_preset_slots_member_idx on public.party_preset_slots (roster_member_id) where roster_member_id is not null;

-- ---------------------------------------------------------------------
-- guild_audit_log — record of sensitive guild operations (written by
-- triggers / security-definer functions only; Guild Leader can read).
-- ---------------------------------------------------------------------
create table if not exists public.guild_audit_log (
  id          bigint generated always as identity primary key,
  guild_id    uuid not null references public.guilds (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists guild_audit_log_guild_time_idx on public.guild_audit_log (guild_id, created_at desc);
