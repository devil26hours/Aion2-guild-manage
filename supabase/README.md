# Supabase — schema & migration plan

**Status (2026-11-03):** Supabase is the app's **only live storage** (Auth, PostgreSQL,
Storage). The owner has run 0001–0005; **0006 must still be run**. Nothing in
this folder runs automatically: run the SQL by hand in **Supabase Dashboard → SQL Editor**.
The project started **fresh**: no JSON data was imported (see "Data migration strategy").

## Migration files (run in this order)

| File | Contents |
|---|---|
| `migrations/20261103000001_core_schema.sql` | pgcrypto, enums, all tables, constraints, indexes |
| `migrations/20261103000002_functions_triggers.sql` | `updated_at`, the new-user → profile trigger, permission helpers, member cap, roster/membership guards, snapshot pruning, preset limits |
| `migrations/20261103000003_rpc_functions.sql` | `create_guild`, `set_join_code`, `join_guild`, `claim_character`, `guild_data_overview`; service-role-only API writers |
| `migrations/20261103000004_rls_policies.sql` | RLS on every table, table and column grants, policies |
| `migrations/20261103000005_storage_guild_images.sql` | Private `guild-images` bucket (1 MB, PNG/JPEG) and its storage policies |
| `migrations/20261103000006_gap_rpcs.sql` | `list_joinable_guilds`, `guild_join_code_set`, `add_roster_member` (owner auto-join), `save_party_preset` (SECURITY INVOKER, atomic per preset). Changes no existing table, policy or grant |
| `migrations/20261103000007_party_preset_content.sql` | `party_presets.content_type` and `dungeon_name` (both nullable), their column grants, and `save_party_preset` replaced with a version that writes them |

The files are written to be re-runnable (`if not exists`, `create or replace`, `drop policy if exists`).
After re-running 0004 or 0006, re-run 0007: 0004 revokes its column grants, and 0006 recreates the old `save_party_preset` signature.
They target Postgres 15 or later: `on delete set null (column)` needs 15+, and Supabase uses 15/17.

## Tables and relationships

```
auth.users 1─1 profiles
profiles 1─0..1 guild_memberships ─* guilds          (one guild per account; role leader|member)
guilds 1─1 guild_settings, 1─1 guild_secrets (join code bcrypt hash, no client access)
profiles 1─0..1 character_ownerships 0..1─1 characters   (one owner per character, one character per account)
guilds 1─* guild_roster_members *─1 characters        (UNIQUE character → one guild per character)
guild_roster_members 1─* character_snapshots 1─* character_snapshot_equipment
guilds 1─* party_presets 1─* party_preset_slots ─0..1 guild_roster_members (same guild, composite FK)
guilds 1─* guild_audit_log ; profiles 1─* guild_join_attempts (rate limit)
storage.objects (bucket guild-images, path "<guild uuid>/<file>")
```

**Ownership is separate from membership.** `character_ownerships` links an account to a character.
`guild_memberships` links an account to a guild. `guild_roster_members` links a character to a guild roster.
A roster entry counts as "linked" when its character has an owner. The JSON `member.user_id` becomes a join, not a column.

## Permissions (RLS)

| Data | Guild Member | Guild Leader | Server only (service_role) |
|---|---|---|---|
| guilds (list, for joining) | read all | update own (only the listed columns) | – |
| guild_settings | read own guild | update own guild | – |
| guild_memberships | read own guild | remove members (not themselves; a trigger guards the leader row) | – |
| characters | read own and own guild roster | same | write (`upsert_character_from_api`, `record_character_refresh_error`) |
| character_ownerships | read own and guild-mates | same | – (created only by `claim_character`) |
| guild_roster_members | read | insert, update role/notes, delete (a trigger blocks removing the leader's own character) | – |
| snapshots and equipment | read | read | write (`record_character_snapshot`) |
| party_presets and slots | read | full CRUD | – |
| guild_audit_log | – | read | written by triggers and RPCs |
| guild_secrets, guild_join_attempts | – | – | RPC internals only |

- `anon` has no table access at all.
- Identity and permission columns can't be updated, because of column-level grants and lock triggers. These include `guild_id`, `character_id`, `leader_user_id` and `role`.
- Multi-step operations are `SECURITY DEFINER` RPCs that validate `auth.uid()` themselves. These are create, join, claim and the join code.
  - The member cap is enforced by a trigger under a guild row lock.
  - The join code is limited to 5 failed tries per 10 minutes, enforced in the database.
- Character data comes from the AION 2 API, so only the Next.js server may write it.
  - Writing it needs a server-only Supabase **secret key** in a later phase.
  - That key is never `NEXT_PUBLIC_` and is never sent to the browser.

## JSON → table mapping

| JSON | Table / column |
|---|---|
| `users.json` `users[].id` | `profiles.legacy_user_id` (new `profiles.id` = Supabase Auth uuid) |
| `users[].email` | `auth.users.email` (Supabase Auth) |
| `users[].password` (scrypt) | **not migrated.** Supabase Auth can't import these scrypt hashes, so users set a new password (invite or reset) |
| `users[].character` | `characters` (identity) + `character_ownerships` |
| `users[].guild_id` | `guild_memberships.guild_id` (role `leader` if `guilds.json` `leader_user_id` matches) |
| `users[].bootstrap` | dropped (only meaningful for the JSON migration) |
| `guilds.json` `guilds[].id` | `guilds.legacy_guild_id` (new uuid `guilds.id`) |
| `guilds[].leader_user_id` | `guilds.leader_user_id` + `guild_memberships.role='leader'` |
| `guilds[].join_code` (scrypt) | **not migrated.** `guild_secrets.join_code_hash` starts null, and the leader sets a new code |
| `sessions.json` | **not migrated.** Supabase Auth sessions replace it |
| `guild-settings.json` `guild.name/server/description/leader/memberCap` | `guilds.name/server/description/leader_label/member_cap` |
| `guild.image` | `guilds.image_*` + Storage object `guild-images/<guild uuid>/<file>` |
| `admin.*` | `guild_settings.admin_display_name/email/title/bio` |
| `prefs.defaultSort/partyView` | `guild_settings.default_sort/party_view` |
| `prefs.dashboard.*` | `guild_settings.show_* / recent_updates_count` |
| `guild-roster.json` `members[]` identity (`region`, `server_id`, `character_id`) | `characters` (unique identity) |
| `members[]` API fields, `api_raw`, `api_updated_at`, `last_refresh_error` | `characters.*` |
| `members[].role/notes/added_at` | `guild_roster_members.role/notes/added_at` |
| `members[].user_id` | implied by `character_ownerships` (no column) |
| `members[].snapshots[]` | `character_snapshots` (+ `character_snapshot_equipment`, one row per `equipment[]` item, `position` = array index) |
| `party-presets.json` `presets[].id/name/created_at/updated_at` | `party_presets.legacy_id/name/created_at/updated_at` |
| `presets[].slots[i]` | `party_preset_slots(position=i, roster_member_id, role)`; `slot_count` = `slots.length` |
| `legacy-backup-*/` | not imported (kept as the original backup) |

### Behaviour differences to keep in mind

1. **Party slot pointing at a removed member.**
   - JSON keeps the old id and shows the slot as "removed".
   - The DB sets `roster_member_id` to null (the FK uses `on delete set null`), so the slot shows as empty.
   - During import, a slot whose id isn't in the roster becomes null.
2. **The leader can't delete their own account while leading.** Leadership transfer comes later.
3. **The migrated bootstrap leader (`admin@guild.local`, no character)** keeps no ownership row until they claim a character.

## Data migration strategy (superseded — fresh start chosen 2026-11-03)

The owner chose to discard the JSON data instead of importing it. The steps below were
never run and are kept only for reference. The JSON backup is in `backups/` at the project root.

1. Make a full copy of `data/` and keep it. Don't modify the originals.
2. Create the Supabase Auth users with the Admin API. This needs the secret key, server-side only, in a one-off script.
   - Use the same emails.
   - Send invite or reset emails, because passwords can't be carried over.
   - Record the mapping `u-… → auth uuid` in `profiles.legacy_user_id`.
3. Import the data in one transaction per guild, using a one-off script with the secret key:
   1. `guilds` (with `legacy_guild_id`), then `guild_settings`
   2. `characters`
   3. `character_ownerships`
   4. `guild_memberships`
   5. `guild_roster_members`
   6. snapshots and equipment
   7. presets and slots
   8. image upload to Storage

   Triggers run during the import: the member cap and preset limits apply.
4. Verify per guild:
   - Row counts match the JSON: members, snapshots, presets, linked accounts.
   - Spot-check a few profiles.
   - Re-run the uniqueness checks.
5. Switch the storage modules (`src/lib/*/storage.ts`, `accounts/users.ts`, `guilds/index-store.ts`, `auth/*`) to Supabase. Keep the JSON files read-only as a fallback backup.
6. Only after the owner signs off, retire the JSON writes.

The **Download JSON** export in Settings → Data Management produces a per-guild file with the same content and can serve as an extra pre-migration backup.

## Manual steps in the Supabase Dashboard

1. **SQL Editor:** run `migrations/20261103000006_gap_rpcs.sql` (0001–0005 are already applied), then
   `migrations/20261103000007_party_preset_content.sql`. Check that both finish without errors.
   Run 0007 before deploying the app code that reads its columns.
2. **`.env.local`:** add the server-only secret key as `SUPABASE_SECRET_KEY=sb_secret_…`
   (Project Settings → API Keys). Never give it a `NEXT_PUBLIC_` prefix. Restart the server.
   - Optional: `SITE_URL=https://your.domain`, the origin used in email links. Without it, the request origin is used.
3. **Authentication → URL Configuration:** set **Site URL** to the app origin and add
   `<origin>/auth/confirm` (e.g. `http://localhost:3000/auth/confirm`) to **Redirect URLs**.
4. **Authentication → Sign In / Providers → Email:** keep **Confirm email** ON. The app claims the
   chosen character after confirmation.
5. **Authentication → Emails (recommended):** use `token_hash` links, so confirmation and reset links
   work in any browser:
   - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/guild-setup`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`

   With the default templates (PKCE `code` links), a link only works in the browser that started the flow.
6. **Authentication → SMTP:** the built-in mailer only delivers to the project's team-member addresses and
   is heavily rate-limited. Set up custom SMTP before real users register.
7. **Check for old data:** Table Editor and Authentication → Users should be empty (fresh start). Delete
   only test rows or users you created yourself.
8. **Database → Backups:** confirm backups are enabled.
