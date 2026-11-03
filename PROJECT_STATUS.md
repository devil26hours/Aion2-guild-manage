# AION 2 Guild Command — Project Status

_Last updated: 2026-11-03 (Supabase integration). Read this first in a new session._

## 1. Overview & stack
Private guild-management web app for AION 2 (dark fantasy theme).
- **Next.js 16.4 App Router** with `cacheComponents: true` and `partialPrefetching`.
  - Read `node_modules/next/dist/docs/` before using Next APIs.
  - Middleware is now **`src/proxy.ts`**.
  - Runtime `params` resolve inside `<Suspense>`.
- **Libraries:** React 19, TypeScript, Tailwind v4, shadcn/radix UI, lucide icons. No other runtime deps added.
- **Character data:** a local, unofficial AION2 Python API at `AION2_API_BASE_URL`.
  - Server-only env var, default `http://127.0.0.1:8000`.
  - The browser only calls Next Route Handlers, never the Python API.
- **Package manager:** `pnpm`. Scripts: `pnpm build`, `pnpm lint`, `npx tsc --noEmit` (run `pnpm build` first so `RouteContext` types are generated).

## 2. Architecture & persistence (Supabase — the only live storage)
- **Fresh start (2026-11-03):** the owner chose to discard all JSON data, so nothing was imported.
  - The JSON persistence code was removed: `storage/json-file`, `accounts/password`, `auth/sessions`, `guilds/index-store`, `guilds/membership` and `migrate`.
  - The old `data/` folder is no longer read or written.
  - Recovery copy: `backups/data-pre-supabase-2026-11-03T16-33-05Z/` (+ `.sha256`). Keep it for now.
- **Clients** (`src/lib/supabase/`):
  - `server.ts`: user client bound to the auth cookies, so every query runs under **RLS**. Every Route Handler uses it.
  - `proxy.ts`: refreshes the session in `src/proxy.ts` and verifies it with `getClaims()`.
  - `admin.ts`: server-only `SUPABASE_SECRET_KEY` client. It is used **only** for the following service_role tasks:
    - `upsert_character_from_api`, `record_character_snapshot`, `record_character_refresh_error`
    - the registration ownership pre-check
    - guild-browser images for non-members
  - `errors.ts`: maps RPC `CODE: message` errors and Postgres errors to the app's `{ error: { code, message, status } }`.
  - `cookies.ts`: "remember me" handling. When it is off, auth cookies become browser-session cookies (`aion2_remember`).
  - There is no browser Supabase client. The browser still calls only Route Handlers.
- **Data modules (same names, now Supabase):**
  - `roster/storage.ts`: `guild_roster_members` + `characters` + ownership, snapshots and equipment.
  - `settings/storage.ts`: `guilds` + `guild_settings`, plus the Storage bucket `guild-images`.
  - `party/storage.ts`: `party_presets`/`party_preset_slots` through `save_party_preset`.
- **IDs:** the API still exposes the original IDs, so the client stores and URLs are unchanged. The server maps them to database UUIDs:
  - Roster members: `region:server:character` (the `characters` identity).
  - Party presets: `p-…`, stored in `party_presets.legacy_id`.
  - Guild IDs are now UUIDs.
- **Behaviour change:** a party slot whose member is removed becomes **empty**. The FK is `on delete set null`; before, the slot showed "removed".
- **Client side:** unchanged. Stores use `useSyncExternalStore`, reload on window focus, and send party edits as small ops.
- **SQL:** `supabase/migrations/0001–0006` (see `supabase/README.md`).
  - **0006 (`20261103000006_gap_rpcs.sql`) must be run by the owner in the SQL Editor.** Without it these fail: the guild browser, the join-code status, adding roster members, and saving party presets.

## 3. Auth, registration, guilds, permissions
- **Supabase Auth:** email + password, with email confirmation **ON**. Passwords are hashed and stored by Supabase only.
- **Proxy (`src/proxy.ts`):**
  - **Public:** `/login`, `/register`, `/forgot-password`, `/auth/confirm`, and the APIs `/api/auth/{login,logout,register,forgot-password,character-search}`.
  - `/reset-password` needs a session but no guild.
  - Everything else needs a session; pages redirect to `/login?next=`, APIs return 401.
  - An account with no guild can only reach `/guild-setup`.
- **Handler checks:** `src/lib/auth/context.ts` re-checks in every handler:
  - `requireUser`, `requireGuild`, `requireGuild({ leader: true })`.
  - They read the account's own membership and ownership through RLS.
  - RLS and the RPCs enforce the same rules again in the database.
- **Registration (`/api/auth/register`):**
  1. The server verifies the character through the API.
  2. It writes the character row (service_role) and checks it isn't owned.
  3. It calls `signUp` with `pending_character_id` in the user metadata.
  4. **After confirmation**, `/auth/confirm` (`token_hash` or PKCE `code`) calls `claim_character` as the user (`src/lib/auth/claim.ts`). Sign-in retries the claim if needed.
  5. If a roster already contains the character, the account joins that guild through the existing record, with no duplicate.
- **Password reset:**
  - `/forgot-password` sends `resetPasswordForEmail`.
  - The email link goes to `/auth/confirm` and then to `/reset-password`.
  - After `updateUser({ password })` the user is signed out and goes to `/login?reset=done`.
- **Guilds (RPCs):**
  - `list_joinable_guilds` (browser, safe fields only).
  - `create_guild`: the creator becomes leader and first roster member. The server then adds a snapshot and the default presets.
  - `join_guild`: 4-digit bcrypt code, 5 wrong tries per 10 min in the database.
  - `set_join_code` (leader) and `guild_join_code_set`.
  - `add_roster_member` (leader): one roster per character. It blocks an owner who is in another guild and auto-joins an owner who has no guild.
  - Rules: one guild per account; one character per account; one roster per character.
- **Leader only** (route checks + RLS):
  - add, remove, edit or refresh members
  - settings and image
  - party presets
  - join code
  - export

  The leader's own character can't be removed (trigger). Removing a linked member drops that account's membership (trigger).
- **Members:** read-only. The UI hides edit controls (`useIsLeader()`).
- **API Lab (`/api-lab`):** unchanged. It is a second gate, checked against `API_LAB_PASSWORD`.

## 4. Supabase status
**Integrated (2026-11-03). Code-level verification only:** typecheck, lint and build pass. **No live request has been made** with a user session or the secret key.
- **Environment:**
  - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set.
  - **`SUPABASE_SECRET_KEY` is NOT set.** Until it is, these return 503 `NOT_CONFIGURED`: registration, create/join guild, add member, refresh, and guild-browser images for non-members.
  - Optional: `SITE_URL` (origin used in email links).
- **Existing Supabase data:** not inspected. Without the secret key nothing beyond `anon` is readable, and `anon` has no table access. Check Table Editor and Authentication → Users before going live.
- **Dashboard steps for the owner:** see `supabase/README.md` → "Manual steps".
  - Run 0006.
  - Add redirect URLs `<origin>/auth/confirm`.
  - Optionally switch the email templates to `token_hash` links (they work in any browser).
  - Set up custom SMTP for real users: the built-in mailer only reaches team addresses and is rate-limited.

## 5. Completed features (implemented; earlier ones browser-tested)
- **Members:** real roster from the API.
  - Search with same-name/server selection, add and remove.
  - Manual guild roles, comment/nickname (`notes`), refresh with role preserved.
  - Member cap from settings, enforced server-side.
  - CP min/max filters (inclusive, formatted input parsed).
- **Character profile** (`/members/[id]` for roster ids; demo profile for mock ids), with an equipment tooltip and raw JSON collapsed.
- **Character History:** real snapshots, charts, A/B comparison. A demo tab with simulated data remains, intentionally.
- **Party Builder:**
  - 2–10 slots, presets, role/class/CP/item-level filters.
  - Warning when a player is already in another preset.
  - Suggestions, analysis, PNG export (canvas, no dependency).
- **Dashboard** from real data: counts, averages, class and role distribution, top members, recent snapshots, presets.
- **Settings:** guild info, guild image (PNG/JPEG only, at most 1 MB, magic-byte check), admin profile, prefs, join code, account panel, language. Members get a read-only view.
  - **Data Management** (`components/settings/data-management.tsx`), rebuilt for Supabase:
    - database status (real read) and server-write status, plus a leader-only connection test
    - counts: accounts, roster, registered characters, snapshots, presets
    - guild image storage info
    - leader-only guild JSON export (no secrets), with Restore shown as "Not available yet"
    - the guild-scoped resets

    Not browser-tested.
- **Navigation:** sidebar and mobile nav with a Developer › API Lab entry and correct active states; logout button.
- **Class images** from `public/image/class-pic/` (Spiritmaster uses the Elementalist image).
- **i18n:** EN/TH (`src/lib/i18n/index.ts`, dictionary `src/lib/i18n/th.ts`, keyed by the English text).
  - `useT()` / `tNow()`; locale saved in localStorage; `LanguageSwitcher` component.
  - Server errors are localized by code (`error:CODE` entries).
  - Game and feature terms stay English.

## 6. Pending / not verified
- **Not run against a live project yet.** The code passes typecheck, lint and build. The owner tests the UI and workflows manually: register → confirm → guild setup, join/create, members, refresh, history, party presets, image, settings, Data Management, reset password, TH/EN.
- **Blocked until `SUPABASE_SECRET_KEY` is set and 0006 is run** (see §4).
- **Restore from an export:** not implemented. Data Management shows it as "Not available yet".
- The old-browser localStorage import (presets and settings from the pre-server version) was removed from Data Management, because this is a fresh start.

## 7. Known caveats
- **Character ownership isn't proven:** anyone can register an unclaimed character, because AION 2 offers no ownership verification.
- **`pending_character_id` is user metadata**, which the user can edit. It is only a request: `claim_character` re-checks existence and uniqueness.
- **Rate limits:** login, register, forgot-password and the public character search are still in memory per process (Supabase Auth has its own limits). Join-code attempts are limited in the database.
- **PKCE confirmation/reset links** (default Supabase templates) only work in the browser that started the flow. If a confirmation link is opened elsewhere, the email is still confirmed and the claim happens at the next sign-in. Switch the templates to `token_hash` to avoid this.
- **Party presets:** each preset is saved atomically (`save_party_preset`), but a multi-preset op such as reset-all is several calls. Preset names are unique per guild, case-insensitive (DB index). A clash returns `PARTY_RULE`.
- **Join codes** are hashed, so a leader can't view them later and must set a new one.
- **No leadership transfer** and no "leave guild" flow yet. The leader membership can't be deleted (trigger).
- **i18n gaps** (unchanged):
  - The server shell renders English first, then switches to Thai on the client (brief flash).
  - Intentionally English: API Lab internals, the demo/mock views, page `<title>`s, PNG export text.
- **Dead mock code** is still present but not routed: `components/members/*`, `lib/members/*`, `data/mock/*`.

## 8. Key locations & conventions
- **Server-only modules** throw if `typeof window !== "undefined"`.
- **Route helpers** live in `src/lib/roster/http.ts`: `json`, `fail(status, code, msg)`, `readJsonBody`, `storageFailure` (maps DB errors). Errors are shaped `{ error: { code, message, status } }`.
- **Client fetches** go through `src/lib/client/api.ts` (`call()`), which localizes errors and redirects on 401.
- **New UI text:** wrap it in `t("English text")` and add a Thai entry to `th.ts`.
- **Editing practice:** targeted edits only, no broad refactors, keep the dark AION theme. Don't invent API fields or game stats. Use "Combat Speed", not "Attack Speed". No NCSOFT assets.
- **Working style the owner expects:** stop after each step for review, and report changed files plus typecheck/lint/build results.

## 9. Next steps (priority order)
1. **Owner setup:**
   - add `SUPABASE_SECRET_KEY`
   - run 0006
   - set the Auth redirect URLs
   - optionally set up custom SMTP and `token_hash` email templates
2. **Manual UI/workflow tests** by the owner. Fix issues found.
3. **Later:**
   - restore from export
   - leadership transfer
   - leave guild
   - delete the unused `data/` folder and backup once Supabase is verified
