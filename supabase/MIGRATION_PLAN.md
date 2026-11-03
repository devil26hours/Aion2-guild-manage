# JSON → Supabase migration plan (for review)

_Superseded 2026-11-03: the owner chose a fresh start, so nothing is imported. Gaps G1–G3 are implemented in migration 0006, and G4 is handled by claiming the character after email confirmation. Kept for reference._

## 1. Verified state

| Item | Status |
|---|---|
| Schema in the live project | **Verified** (publishable-key probe): all 14 tables exist; `anon` gets `42501 permission denied` on every table and on `guild_data_overview`, as 0004 intends |
| Storage bucket `guild-images` | Not visible to `anon` (expected, it is private). It can only be confirmed with the secret key or in the Dashboard |
| Auth settings | Email provider **on**, sign-up **on**, **email confirmation ON** (`mailer_autoconfirm: false`) |
| `NEXT_PUBLIC_SUPABASE_URL` / `_PUBLISHABLE_KEY` | Set (`sb_publishable_…`) |
| `SUPABASE_SECRET_KEY` | **Missing.** It is required, see §3 |
| Packages | `@supabase/ssr` 0.12.7 and `@supabase/supabase-js` 2.118.0 are used. `@supabase/server` 1.9.2 is installed but is meant for Bearer-token and Edge APIs, so it is not needed here |
| Backup | `backups/data-pre-supabase-2026-11-03T16-33-05Z/` (13 files), with checksums in `backups/data-pre-supabase-2026-11-03T16-33-05Z.sha256`, verified identical. `/backups/` is gitignored |

## 2. Actual JSON data (what an import would move)

| JSON | Records | → Table rows |
|---|---|---|
| `users.json` | 3 (1 bootstrap `admin@guild.local` without a character, 2 with characters) | 3 `auth.users` + `profiles` (`legacy_user_id`) |
| `guilds.json` | 2 (`Mirror`: leader is the bootstrap account, no join code; `STEP`: join code set) | 2 `guilds` (`legacy_guild_id`) + `guild_settings` + `guild_secrets` (hash **null**) |
| memberships | 3 (2 leaders, 1 member) | 3 `guild_memberships` |
| roster members | 4 (unique across guilds, verified) | 4 `characters` + 4 `guild_roster_members` |
| owned characters | 2 | 2 `character_ownerships` |
| snapshots | 6 (25 equipment items each) | 6 `character_snapshots` + 150 `character_snapshot_equipment` |
| party presets | 3 (2 filled slots in total) | 3 `party_presets` (`legacy_id`) + 2 `party_preset_slots` |
| guild image | 1 JPEG, 60 183 bytes (STEP) | 1 Storage object `guild-images/<guild uuid>/guild-mw0teuj7-b1ba8e96c3412e15.jpg` |
| `sessions.json`, password and join-code hashes | — | **not migrated** (see `README.md`) |

All values pass the 0001 CHECK constraints: name and length limits, regions, id regexes, the image name regex, and the preset `legacy_id` regex (`p-demo-a`/`p-demo-b` match).

**Import mechanics** (one-off script, secret key, `--dry-run` by default):
- Ids map through `legacy_*` columns, and the roster id `region:server:char` maps to the `characters` identity. That makes re-runs skip existing rows (repeatable).
- Original timestamps are kept: `created_at`, `added_at`, `api_updated_at`, `captured_at`, and the preset timestamps.
- Afterwards the row counts are compared against the table above.

## 3. Why `SUPABASE_SECRET_KEY` is required

0003 grants `upsert_character_from_api`, `record_character_refresh_error` and `record_character_snapshot` to **service_role only**. Without the secret key the app can't do any of these:
- write a `characters` row, which `claim_character` needs before **registration** can claim it
- **add a roster member** or **refresh** one
- take the first snapshot on **create/join guild**
- **import** anything (Auth Admin API)

So no feature can move to Supabase until the key is in `.env.local`:
- set it as `SUPABASE_SECRET_KEY=sb_secret_…`
- never with a `NEXT_PUBLIC_` prefix
- `src/lib/supabase/admin.ts` refuses to start if a secret-looking variable has a `NEXT_PUBLIC_` name

## 4. Schema gaps found (current behaviour that the SQL can't reproduce under RLS)

| # | Feature | Problem in 0001–0005 | Proposed fix |
|---|---|---|---|
| G1 | Guild browser (`GET /api/guilds`, before joining) shows member count, leader name, "join open" and the image | A non-member can read `guilds` but **not** the roster (count), the leader's character, `guild_secrets` (code set?) or the Storage image | New **0006** `list_joinable_guilds(p_query)` SECURITY DEFINER. It returns only public fields plus `member_count` and `join_code_set`. The browser image is served by the server (admin client, read-only) |
| G2 | `/api/auth/me` → `join_code_set` (leader's Settings) | `guild_secrets` has no client access at all | 0006 `guild_join_code_set()`: callers must be in the guild |
| G3 | Leader adds a character whose **registered owner has no guild**: today the owner joins automatically | `guild_memberships` inserts are RPC-only, and no RPC covers this | 0006 `link_roster_owner(p_roster_member)`, leader-only. **Or** drop the behaviour: the owner then joins with the code, and `join_guild` links the existing roster row with no duplicate |
| G4 | Registration signs in immediately | **Email confirmation is ON.** `signUp` returns no session, so `claim_character` (`auth.uid()`) can't run in the same request | **A:** turn off "Confirm email" (same UX as today). **B:** keep it on; store the selected character, then claim it on the first sign-in after confirmation. This needs a callback route |
| G5 | Party ops are atomic per file today | Multi-row edits through PostgREST aren't one transaction | Targeted per-op writes. There is one leader per guild, so the race is limited to one person's tabs. No schema change |
| G6 | New guild gets 2 default presets and `leader` = character name | `create_guild` creates neither | The server adds them right after the RPC (RLS allows the leader). Reads tolerate a guild with no presets |

G1–G3 need a small migration **0006**. Per the rules I have not written or run it without approval.

## 5. Decisions needed from the owner

1. **Add `SUPABASE_SECRET_KEY`** to `.env.local`. This is required.
2. **Approve 0006** (G1–G3), or choose to drop the G3 behaviour.
3. **Email confirmation (G4):** A (off) or B (on, plus a callback flow).
4. **Migrated passwords.** Supabase can't import the scrypt hashes, so every migrated user must set a new password. Two constraints:
   - Supabase's **built-in mailer only delivers to the project's team-member addresses** and is heavily rate-limited, so reset emails to real users need **custom SMTP**.
   - Alternative: the owner sets a temporary password per user through the import script (printed once, locally) and tells each user.
   - Either way the app gains a "Forgot / set new password" page.
5. **Bootstrap leader `admin@guild.local`.** It leads guild **Mirror**, has no character, and can never receive mail. Provide a real email to import it under, or another account to become Mirror's leader.
6. **Restore in Data Management.** I propose shipping **export now and restore later**, labelled "not available yet". A safe restore needs multi-table writes with preview and duplicate handling. That is a separate piece of work.

## 6. Implementation order once 1–5 are answered

1. **Clients:** `admin.ts` (done), `server.ts` (exists), wire `updateSupabaseSession` into `src/proxy.ts`. The browser keeps calling Route Handlers only, so no browser Supabase client is needed.
2. **0006** (if approved): the owner runs it in the SQL Editor; then I verify it.
3. **Auth:** login, register, logout and me move to Supabase Auth, keeping the same forms and error codes. "Remember me" becomes session-only cookies when unchecked. `requireUser`/`requireGuild` read the Supabase user and their membership.
4. **Storage modules, one route group at a time, each tested:**
   1. settings and image
   2. roster, refresh and snapshots
   3. party presets
   4. guilds, join and join code
   5. data overview and export
5. **Import:** dry-run → owner review → apply → count verification. JSON stays read-only on disk and is never deleted.
6. **Data Management redesign:**
   - real connection status
   - guild export (no secrets)
   - DB-backed counts
   - image size from `guilds.image_size`
   - restore marked unavailable
7. **Full test pass** (Phase 7 list), plus typecheck, lint and build.
