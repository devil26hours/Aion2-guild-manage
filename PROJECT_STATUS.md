# AION 2 Guild Command — Project Status

_Last updated: 2026-11-04 (community feedback + DEV dashboard; before that theme refinement). Read this first in a new session._

## 1. Overview & stack
Private guild-management web app for AION 2 (modern fantasy look, light and dark themes).
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
- **SQL:** `supabase/migrations/0001–0009` (see `supabase/README.md`). 0008 is feedback + DEV (§5b), 0009 is the DEV tools (§5c).
  - **0006 (`20261103000006_gap_rpcs.sql`) must be run by the owner in the SQL Editor.** Without it these fail: the guild browser, the join-code status, adding roster members, and saving party presets.

## 3. Auth, registration, guilds, permissions
- **Supabase Auth:** email + password, with email confirmation **ON**. Passwords are hashed and stored by Supabase only.
- **Proxy (`src/proxy.ts`):**
  - **Guests** (signed cookie, see §5d) may use only Character Lookup and its four AION2 endpoints.
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
- **API Lab (`/dev/api-lab`):** DEV only, behind a second password stored as a hash in the database (see §5c). `API_LAB_PASSWORD` is no longer used.

## 4. Supabase status
**Integrated (2026-11-03). Code-level verification only:** typecheck, lint and build pass. **No live request has been made** with a user session or the secret key.
- **Environment:**
  - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set.
  - **`SUPABASE_SECRET_KEY` is NOT set.** Until it is, these return 503 `NOT_CONFIGURED`: registration, create/join guild, add member, refresh, and guild-browser images for non-members.
  - Optional: `SITE_URL` (origin used in email links).
  - Optional: `NEXT_PUBLIC_DISCORD_URL` (Discord button in the footer bar; hidden when unset). Inlined at build time, so a change needs a rebuild.
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
- **Theme refresh + light/dark mode (2026-11-04):** see §8 "Theming" for how it works.
  - Deep blue and cyan for actions and active states, gold for decoration and important highlights, subtle purple for special badges and secondary accents, inspired by the official AION2 site. No NCSOFT assets. Layouts, features and workflows are unchanged.
  - Surfaces are layered: page, then panel, then nested wells. The header is deep blue with a gold hairline in both themes.
  - Toggle in the app header and on the auth pages. The first visit follows the system setting, a pick is saved in this browser, and open tabs stay in sync.
- **Navigation:** sidebar and mobile nav with a DEV-only Developer group (see §5c) and correct active states; logout button.
- **Class images** from `public/image/class-pic/` (Spiritmaster uses the Elementalist image).
- **i18n:** EN/TH (`src/lib/i18n/index.ts`, dictionary `src/lib/i18n/th.ts`, keyed by the English text).
  - `useT()` / `tNow()`; locale saved in localStorage; `LanguageSwitcher` component.
  - Server errors are localized by code (`error:CODE` entries).
  - Game and feature terms stay English.

## 5a. Support page (/support)
- **Buy Me a Coffee** button in the footer bar next to Discord (larger; always shown) and in the guest/auth footer; **Support** button in the login page's top row beside Feedback. Both link to `/support`.
- `/support` is public (listed in `OPEN_PAGES` in `src/proxy.ts`), so signed-in users, signed-out visitors and guests can open it. Components: `components/support/support-view.tsx`, `support-button.tsx`; page `app/support/page.tsx`.
- Shows the Krungsri bank-transfer details with a **Copy Account Number** button (Clipboard API, falls back to `execCommand`; copies digits only, `1701608758`). The project has no toast system, so feedback is an inline `aria-live` message.
- No QR code (no PromptPay data supplied), no payment gateway, no tiers or perks. Bank details are constants in `support-view.tsx`.
- Thai/English strings are in `lib/i18n/th.ts` under "support".

## 5a-2. Cookies, PDPA notice & footer (2026-11-04)
- **Audit:** no analytics, ads, tracking scripts or third-party integrations exist (fonts are self-hosted by `next/font`). Cookies: Supabase Auth `sb-<project>-auth-token` (+ chunks), `aion2_remember`, `aion2_guest` (strictly necessary); `aion2_lang` (user-requested preference, not read by the server). localStorage: `aion2-gc:{theme,lang,remembered-email,active-preset,cookie-notice}`.
- **No consent banner**: with no optional cookies there is nothing to accept or reject, so there are no consent toggles. A one-time **cookie notice** (`components/cookies/cookie-notice.tsx`, state in `lib/cookie-notice.ts`) is dismissed only by the "Understood" button and stores the policy version and timestamp. Bump `COOKIE_POLICY_VERSION` on a material change to show it again.
- **/cookie-policy** (public, in `OPEN_PAGES`) was re-audited against the code (policy version `2026-11-04-r2`). Facts: the Supabase cookie is not HttpOnly (library default), holds tokens plus user ID/email, lasts until the browser closes or up to 400 days (Remember me); `aion2_remember` is functional, 400 days or session; `aion2_guest` is an HMAC-signed `{r:guest,exp}` token, 8 h, no identifiers; `aion2_lang` is never read by the server; `aion2-gc:remembered-email` holds the plain email and is NOT cleared on sign-out; item icons/portraits load straight from API-supplied URLs (third-party hosts). It lists every cookie/storage entry above; update `components/cookies/cookie-policy-view.tsx` whenever a cookie or storage key is added. If optional cookies are ever added, build the consent categories first and gate their scripts behind consent.
- **Footer:** larger text, 40px Buy Me a Coffee and 36px Discord pills, stacked on mobile; `--footer-bar-h` is now 6.5rem (mobile) / 4rem (sm+). A Cookie Policy link is in both footers.

## 5b. Community feedback & DEV dashboard (2026-11-04)
**Code complete; typecheck, lint and build pass. Not run against a live Supabase project** (migration 0008 not applied by me). There is no test framework in the project, so no automated tests exist for this.

**What it does**
- **Feedback button** in the app header and on the login/register/guild-setup pages (`components/feedback/feedback-dialog.tsx`). Categories: Bug Report, Feature Request, General Feedback, Other. Signed-out visitors can send too.
- **DEV Dashboard** at `/dev/feedback` (`components/feedback/feedback-dashboard.tsx`): search (subject/description), category and status filters, sort by date, 20 per page, detail dialog with the submitter, source page and browser, status (Pending, Reviewing, Resolved, Rejected) and an internal developer note. Entry point (DEV only): the Developer group in the sidebar.

**Migration to run (SQL Editor, after 0007):** `supabase/migrations/20261104000008_feedback_and_dev_role.sql`
- Creates `developers`, `feedback`, `feedback_dev_notes`, `is_developer()`, `submit_feedback()`, `dev_list_feedback()`, `dev_update_feedback()`, and enables `pg_trgm`. Additive and re-runnable; it changes no existing table, policy, grant or row.
- Until it runs: feedback submission returns a generic error, `/dev/feedback` shows the "developer only" message, and the rest of the app is unaffected (`/api/auth/me` treats a missing function as "not a developer").

**Environment:** no new variables. Submissions need the existing server-only `SUPABASE_SECRET_KEY` (without it, `POST /api/feedback` returns 503).

**Assign the initial DEV account** (owner only, SQL Editor; never through the app). The person must have registered first:
```sql
insert into public.developers (user_id, note)
select id, 'project developer' from auth.users where email = 'dev@example.com'
on conflict (user_id) do nothing;
```
Revoke with `delete from public.developers where user_id = '<uuid>';`. `developers` has RLS on, no policies and no grants for `anon`/`authenticated`, so no API call can add a DEV.

**How DEV authorization works**
- DEV is separate from guild roles (leader/member); it grants nothing in guild management, and guild leaders get nothing here.
- Every `/api/dev/*` handler calls `requireDeveloper()` (`lib/auth/developer.ts`): verified JWT, then `is_developer()` in the database. A non-DEV gets 403.
- The database enforces it again: `feedback` and `feedback_dev_notes` are readable only through an RLS policy on `is_developer()`; `dev_update_feedback()` (SECURITY DEFINER) re-checks the role; `ip_hash` has no column grant.
- The `is_developer` flag in `/api/auth/me` only controls menu visibility and the page gate; it is never trusted by the server.
- A DEV also needs a guild to reach the app pages (the proxy sends guild-less users to `/guild-setup`).

**Submission security**
- `POST /api/feedback` is public (listed in `proxy.ts`), same-origin only, body ≤ 16 KB, honeypot field, in-memory limit of 5 per 10 min per IP, then a durable database limit (3 per 10 min and 15 per day per account or IP hash) and duplicate detection.
- The sender (user id, email, character name) comes from the verified session, never from the body. The IP is stored only as an HMAC hash. The page URL is stored as a path only (no query string or fragment); other values are dropped.
- Text is stripped of control and bidi characters, length-checked on the server and again by table constraints, and rendered only as plain text (no HTML injection). Database errors are never sent to the browser.
- Only `service_role` can run `submit_feedback()`; clients cannot insert into `feedback`.

**Remaining**
- Rate limiting by IP trusts `x-forwarded-for`; behind a proxy that doesn't set it correctly all visitors share one bucket. The database limit per account still applies.
- No email/notification to the user when the status changes, and users cannot see their own feedback.
- Submitter email is copied into the feedback row at submission time and is not updated or erased when the account is deleted (`user_id` is set to null; the copied name and email stay). Decide on a retention policy if needed.
- No pagination count by status, bulk actions or export.

## 5c. DEV menu: users, announcements, API Lab, overview (2026-11-04)
**Code complete; typecheck, lint and production build pass. Not run against a live Supabase project, and migration 0009 has not been applied.** There is still no test framework, so there are no automated tests. After the build I checked that the new APIs return 401 when signed out, `/api-lab` redirects to `/dev/api-lab`, and `/suspended` renders.

**One DEV menu.** A "Developer" group in the sidebar (and mobile nav), visible only to DEV accounts, with five pages under `/dev`: User Management (`/dev/users`), Announcements & Notifications (`/dev/announcements`), Feedback Management (`/dev/feedback`), API Lab (`/dev/api-lab`) and System Overview (`/dev/overview`). `/dev` redirects to the overview. The old user-menu entry was removed. `app/(app)/dev/layout.tsx` wraps every page in `DevGate` (UI only).

**Migration to run (SQL Editor, after 0008):** `supabase/migrations/20261104000009_dev_tools.sql`. Additive and re-runnable. Creates `user_suspensions`, `notifications`, `notification_reads`, `dev_secrets` (all RLS on; no client access except a user reading their own suspension row) and the functions below. Until it runs: the bell shows empty, suspension is not enforced, and the DEV pages show errors; the rest of the app is unaffected.

**Authorization.** Every `/api/dev/*` handler calls `requireDeveloper()`, and every `dev_*` SQL function re-checks `developers` itself (SECURITY DEFINER with `search_path = ''`). The `is_developer` flag from `/api/auth/me` is only a display hint.

**User management** (`dev_list_users`, `dev_set_suspension`; `PATCH /api/dev/users/[id]`)
- Lists every account with email, character, guild, role, status and last sign-in.
- A DEV can't suspend themselves or another DEV (checked in the database).
- Enforcement: `loadSessionUser` (so `requireUser`/`requireGuild`, i.e. every API) returns 403 `ACCOUNT_SUSPENDED`; `proxy.ts` redirects pages to `/suspended` (log-out button only); the client sends suspended users there on a 403.
- If `SUPABASE_SECRET_KEY` is set, the Auth user is also banned (`ban_duration`), so new sign-ins fail and tokens can't refresh. Without the key only the database check applies (still blocks all app access). The response says whether the ban was applied.

**Announcements & notifications** (`dev_create_notification`, `dev_list_notifications`, `dev_delete_notification`; `my_notifications`, `my_unread_count`, `mark_notifications_read`)
- Announcement = every signed-in user. Notification = any of DEV, Guild Leader, Member.
- **There is no "Admin" role in this app** (roles are guild leader/member plus DEV), so Admin is not offered as a target. Add one only if an admin role is introduced.
- Visibility is decided in the database from the caller's own role; reads are per user. The header bell (`components/notifications/`) polls the unread count every 60 s and on window focus, and loads the list when opened. Messages are rendered as plain text.

**API Lab** moved to `/dev/api-lab` (`/api-lab` redirects there).
- The old password gate was weak: a hard-coded fallback password (`aion2-lab-dev`) applied when `API_LAB_PASSWORD` was unset, and any guild member could call the unlock route. Both are removed.
- The password is now a bcrypt hash in `dev_secrets`, never an environment variable. The first time a DEV opens the page they set it (10–72 characters); it can be changed from the page with the current password. `POST /api/dev/api-lab/unlock` is DEV-only, rate limited (5 per 10 min per account) and delayed on failure. The unlocked state is kept in the page only.
- `API_LAB_PASSWORD` is no longer read; it can be deleted from any environment.
- The `/api/aion2/*` proxy is unchanged because other pages use it; the API Lab is only a front end for it.

**System overview** (`dev_system_overview`, `GET /api/dev/overview`): users (total, confirmed, new in 7 days, active in 30 days, suspended, developers), guilds, accounts in guilds, roster members, characters, snapshots, presets, feedback by status, messages sent, last-24h activity, the five newest guilds with their IDs, and non-secret server facts (your user ID, Supabase project ref, whether the server key and character API are configured, Node version, commit if the host provides it). No keys or URLs are returned.

**Character History:** the "Demo data (simulated)" tab is hidden (`SHOW_DEMO_TAB = false` in `components/roster/history-hub.tsx`); the implementation is untouched.

**Remaining**
- A suspended user's existing access token stays cryptographically valid until it expires (about an hour), but every handler and page rejects it at once through the database check. Only direct calls to Supabase with the public key could still read what RLS lets them read.
- No audit log of DEV actions, and no bulk user actions or user deletion.
- Notifications have no delivery e-mail or per-user targeting (expiry: see 5e).
- The API Lab password protects against someone using a DEV session left open; it is not a second factor.

## 5e. Notification history (2026-11-04)
**Code complete; typecheck, lint and production build pass. Not run against a live Supabase project; migration 0010 has not been applied.** There is no test framework and no test credentials here. After the build I checked with curl that `GET /api/notifications`, `GET /api/notifications/history` and `POST /api/notifications/delete` return 401 signed out and `/notifications` redirects to `/login`. DEV, Guild Leader, Member and Guest sessions, the SQL functions and the delete-isolation behaviour were **not** exercised (see "To verify" below).

**Existing schema inspected first.** `notifications` (global rows with an `audience`) and `notification_reads` (one row per user and notification, deny-all RLS, reachable only through SECURITY DEFINER functions scoped to `auth.uid()`). There was no retention or limit. No new tables.

**Migration to run (SQL Editor, after 0009):** `supabase/migrations/20261104000010_notification_history.sql`. Additive and re-runnable.
- `notification_reads.deleted_at`: a user's personal delete. It only writes that user's own row, so the announcement and other users' copies are untouched. A deleted item also counts as read, so it can't reappear as unread.
- `delete_my_notifications(ids)`: ids the caller can't see (other roles) are ignored; max 100 per call.
- `my_notifications_page(limit, offset, status, kind)`: filtered, offset-paged history (limit capped at 50, `count(*) over ()` for the total).
- `my_notifications` / `my_unread_count` / `mark_notifications_read` were redefined (same signatures) to skip deleted rows and rows older than 90 days.
- **Retention: 90 days.** Old rows are hidden by every user-facing read and removed by `purge_old_notifications()` (internal, not callable from the API): scheduled daily with pg_cron where the extension exists, and also run lazily from `delete_my_notifications`. The DEV list (`dev_list_notifications`) still shows rows until they are purged.
- Until it runs: the bell keeps working; the history page and delete show "database schema is missing a function".

**App.**
- `/notifications` (sidebar item "Notifications", all signed-in roles): status filter (all/unread/read), type filter, 20 per page, expandable rows (opening marks read), select-all-on-page, delete selected / delete one with a confirmation dialog, "Mark all as read", loading/empty/error/retry states, plain-text messages. Components: `components/notifications/notification-history.tsx`.
- Routes: `GET /api/notifications/history`, `POST /api/notifications/delete`; `GET /api/notifications` now returns the 10 most recent for the bell. All use `requireUser`.
- Bell: unchanged location, now 10 items plus a "View all notifications" link; "Mark all read" was already there. It lives in `AppHeader` only, so guests (`GuestShell`) and signed-out visitors never get it; DEV, Leader and Member share the same header.
- Thai strings added to `lib/i18n/th.ts`.

**To verify after applying 0010** (one DEV, one Leader, one Member): each sees only the audiences meant for them; a Member deleting an announcement leaves it visible to the Leader and in the DEV dashboard; "Mark all as read" zeroes the bell; a row with `created_at` older than 90 days disappears.

**Remaining**
- "Mark all as read" marks everything visible, not just the filtered list.
- Deleting is permanent for that user (no undo); a purged notification is gone for everyone.
- The unread badge is polled (60 s), so a new notification can take up to a minute to appear.

## 5f. Leave Guild (member leave and leader transfer) (2026-11-04)
**Code complete; typecheck, lint and production build pass. Migration 0011 has not been applied to a live Supabase project.** The SQL was tested separately: migrations 0001-0011 (0005, storage, excluded) were run on a real Postgres engine (PGlite, in a scratch folder outside the repo, with stubbed `auth` schema and roles) and 47 scenario checks passed (below). The UI was **not** exercised in a browser, and no live Member/Leader/DEV session was available.

**What I found first.** Leadership lives in two places that must agree: `guilds.leader_user_id` (unique) and `guild_memberships.role='leader'` (one per guild, partial unique index). A trigger blocks deleting a leader's membership; RLS lets a leader delete only `member` rows; clients cannot update either column. A character can be on only one roster at a time, and `join_guild` refuses a player whose character is still on another roster. So leaving has to remove the player's roster row too (the same thing that happens when a leader removes a member), or the player could never join another guild. Notification audiences are global per role, so reusing them would have sent "X left" to every guild.

**Migration to run (SQL Editor, after 0010):** `supabase/migrations/20261104000011_leave_guild.sql`. Re-runnable. No new tables.
- `notifications.recipient_user_id` (nullable) and a new kind `'guild'`. A guild event is one row per recipient, so it can never reach another guild or someone who joins later. `notification_is_for_me()` decides visibility; the 0010 functions (`my_notifications`, `my_unread_count`, `my_notifications_page`, `mark_notifications_read`, `delete_my_notifications`) were redefined to use it, so read state, personal delete and the 90-day retention work for guild events. `dev_list_notifications` skips `'guild'` rows, so the DEV dashboard is unchanged.
- `leave_guild(p_new_leader)`: SECURITY DEFINER, `search_path=''`, executable by `authenticated` only. The caller and guild come from `auth.uid()` and the caller's membership; only the successor id comes from the client and is re-checked inside the function.
  - It locks the guild row first, so concurrent leaves, transfers and double submits run one after another; the loser gets `NOT_IN_GUILD` or `INVALID_NEW_LEADER`. Everything, including the notifications, is one transaction.
  - Member: removes the roster entry and the membership. Leader: requires a successor (a current, non-suspended `member` of the same guild, not themselves), demotes the leader row, promotes the successor, updates `guilds.leader_user_id`, then removes the leader's roster entry and membership. Exactly one leader exists after every statement.
  - `guilds.leader_label` (free text) is updated to the new leader's character name if it still named the old leader.
  - Writes `guild.leave` to the audit log.
- `leave_guild_candidates()`: leader only; members of the caller's own guild who can take over (not suspended).
- RLS, grants and the leader-row trigger are unchanged; nothing was weakened.

**Notifications (Thai text is stored in the row, kind "Guild").**
- Member leaves: everyone still in the guild (Leader included) gets "สมาชิกออกจากกิลด์ / <name> ได้ออกจากกิลด์แล้ว"; the leaver gets nothing.
- Leader leaves: the new leader gets "คุณเป็นหัวหน้ากิลด์คนใหม่"; everyone else remaining gets who left and who the new leader is. One row per person, so no duplicates; the previous leader gets none.
- Shown in the bell and `/notifications` (new "Guild" type and filter).

**App.**
- `Settings → Leave Guild` (both roles): `components/settings/leave-guild.tsx`. Member: confirmation dialog explaining the loss of access. Leader: pick a successor from a list of eligible members, then a confirmation step that names the new leader. Loading, error and retry states; the button is disabled while submitting; the list reloads if the choice turns out to be invalid. On success the page hard-navigates to `/guild-setup`.
- `GET/POST /api/guild/leave` (`requireGuild`: signed-in, not suspended, in a guild). A leader without `new_leader_id` gets 400 `NEW_LEADER_REQUIRED` before the database is called; a member passing a successor is rejected.
- New error codes `NOT_IN_GUILD`, `NEW_LEADER_REQUIRED`, `INVALID_NEW_LEADER` with Thai messages; Thai UI strings added.

**Tests performed**
- Built app, curl: `GET`/`POST /api/guild/leave` return 401 signed out and with a forged guest cookie (the proxy only lets guests reach the Character Lookup endpoints); `/settings` redirects to `/login`.
- SQL scenarios (PGlite, 47 passed): signed-out calls rejected; member cannot list candidates or name a successor; leader cannot leave without a successor, choosing self, another guild's member or leader, a suspended member, or an unknown id; member leave removes membership and roster entry, keeps character ownership, leaves the leader and other guilds untouched; notification recipients and counts are exactly as listed above with no duplicates and nothing for the leaver; the leaver, other guilds and a non-member see nothing; a second submit fails with `NOT_IN_GUILD`; leader transfer leaves exactly one leader (the new one) in both tables, removes the old leader's membership and roster entry, and the old leader cannot leave or list candidates again; a sole leader has no candidates and cannot leave; a user's personal notification delete does not affect others; the DEV list hides guild events.
- Typecheck, ESLint, `next build`: pass.

**Not tested / limitations**
- Not run against Supabase with real RLS: the SQL tests ran as the database owner. The functions are SECURITY DEFINER and check `auth.uid()` themselves, but the per-role grants were not exercised.
- True parallel requests were not tested (the engine has one connection); the protection is the guild-row lock plus the re-check under it.
- No browser run of the dialogs (layout on mobile and in both themes is unverified).
- A sole leader cannot leave; there is no delete-guild feature. Another member must join first.
- Leaving removes the character from the roster and with it that roster entry's saved snapshots and party slots (the dialog says so). The account keeps its character link and can join or create another guild.
- Notification text is stored in Thai and is not translated for English users. The bell polls every 60 s, so recipients see it within a minute.
- A leader who is suspended cannot leave (suspended accounts are blocked everywhere); a DEV must deal with that guild.

## 5d. Guest access and DEV-only raw data (2026-11-04)
**Code complete; typecheck, lint and production build pass. No database migration.** Guest access was exercised with curl against the built app (table below). Member, Guild Leader and DEV sessions were **not** exercised, because there are no test credentials here; their code paths are unchanged apart from the points listed.

**Guest session.** "Continue as Guest" on the login page calls `POST /api/auth/guest`, which sets an httpOnly cookie `aion2_guest`: a payload plus HMAC-SHA256 signature with an 8-hour expiry (`lib/auth/guest.ts`). The key is derived from the server-only `SUPABASE_SECRET_KEY`, so no new variable is needed; without that key guest access returns 503 and the button shows an error. A guest has no Supabase account, no row in any table and no database access at all.
- **Proxy (`src/proxy.ts`):** a valid guest cookie counts only when there is no real session. Guest pages: `/character-lookup` is rewritten to `/guest-lookup`, a shell-less page (`app/(guest)/guest-lookup`, `components/layout/guest-shell.tsx`: logo, Guest badge, language, theme, "Back to login"); every other app page redirects to `/character-lookup`. `/guest-lookup` itself redirects (it is reachable only through the rewrite). Login, register, forgot-password and the other public pages stay reachable, so a guest can sign in.
- **APIs:** only `/api/aion2/{servers-roster, character-search, character-profile, character-equipment-item}` pass for a guest (and the already-public auth/feedback endpoints). Everything else returns 403 `GUEST_FORBIDDEN`. The AION2 route re-checks the cookie and the endpoint allowlist itself (defense in depth) and rate limits guests to 90 requests per minute per IP.
- **Leaving:** "Back to login" calls logout, which clears the guest cookie. Signing in with a real account also deletes it. A tampered or expired cookie is treated as signed out.

| Request | Guest | Signed out |
|---|---|---|
| `/character-lookup` | 200 (guest page) | redirect to login |
| `/dashboard`, `/members`, `/settings`, `/dev/*`, `/` , `/guest-lookup` | redirect to `/character-lookup` | redirect to login |
| `/login`, `/register` | 200 | 200 |
| `/api/roster`, `/api/settings`, `/api/data/export`, `/api/auth/me`, `/api/notifications`, `/api/dev/*` | 403 | 401 |
| `/api/aion2/character-search`, `servers-roster` | 200 | 401 |
| `/api/aion2/character-daevanion` | 403 | 401 |

**Raw JSON / debug data is DEV only.** Audit of `JsonViewer`, `JSON.stringify` output, `<pre>`, `api_raw` and diagnostics found:
- "Raw API Data" section of `CharacterProfileView` (used by Character Lookup, member profile, history and the member dialog): now shown only when `/api/auth/me` says the account is a DEV (`useIsDeveloper`). Members, Guild Leaders and guests never see it.
- API Lab (raw responses): already DEV only since §5c.
- Guild export (`/api/data/export`): the stored `api_raw` per character is included only for DEV accounts. Other leaders get the structured export without it.
- "Test connection" in Data Management and `GET /api/data/supabase-check`: now DEV only (route and button). Leaders previously had both.
- Nothing else renders raw payloads. Lookup error lines that show an HTTP status and proxy message remain; they are user-facing error text.

**Remaining limitations**
- `api_raw` is still part of the response of `GET /api/roster/members/[id]` for guild members, and the AION2 proxy still returns upstream JSON to members and guests. The profile screens build their friendly view from that data in the browser, so it can't be removed without moving that mapping to the server. It is public game data from the AION2 API, hidden in the UI but visible in the browser's network tab. The same applies to the Character Lookup response for a guest.
- The DEV check in the UI is a display gate; the DEV APIs and database functions check the role themselves.
- Guest tokens can't be revoked individually before expiry (8 hours). Rotating `SUPABASE_SECRET_KEY` invalidates all of them.
- `server_access` (a yes/no flag) is still returned by `/api/data/overview` to every guild member.
- Rate limits for guests are in memory per process.

## 5g. Interactive Map (/map) (2026-11-04)
**Code complete; typecheck, lint and production build pass; browser-tested as an anonymous visitor and as a guest (see below). Signed-in roles were NOT exercised in a browser (no test account), only reasoned from the proxy code.** Source package: `aion2-extraction-test/integration/` (data contract, validation report, integration guide).

**Owner decisions (2026-11-04):** the Map uses extracted NCSOFT game data and art (map tiles, item icons, monster portraits, names, spawn data); the site is non-commercial. **This is a deliberate exception to "No NCSOFT assets" and applies only to `public/map-data/`**; the rule stands for everything else. The Map is open to EVERY visitor and role (guests, members, leaders, DEV, no-guild, signed-out): no login, role or guild check.

- **Route/menu:** `src/app/map/page.tsx` (outside the route groups, like /support). `/map` is in `OPEN_PAGES` in `src/proxy.ts`. "Interactive Map" is the FIRST item of `NAV_ITEMS` and `NO_GUILD_NAV_ITEMS`; guests get `GUEST_NAV_ITEMS` (Map, Character Lookup) as a menu strip in `GuestShell` (`guest-nav.tsx`). `MapPageShell` picks the frame: signed in -> `AppShell` (sidebar), everyone else -> `GuestShell`. It only asks `/api/auth/me` when a Supabase auth cookie exists (no 401 noise for guests).
- **Data:** `public/map-data/v1/` (90 MB): `manifest.json`, `data/{maps,spawns,entities,classifications,images,l10n}`, `assets/{map-tiles,entity-icons,monster-portraits,map-icons}`. Produced by `aion2-extraction-test/integration/tools/stage_for_chumchon.py` (tiles PNG -> lossy WebP q92, portraits -> lossless WebP, data unchanged except `.png -> .webp` path fields). Per-map files load on demand; shared files (manifest, classifications, images) once; the entity search index only when the search box is used. Cache headers in `next.config.ts` (`/map-data/v1/assets/*` immutable, JSON revalidated hourly).
- **Code:** `src/lib/map/` (`types`, `data` fetch+cache (3 maps in memory), `taxonomy` filter tree, `stores` localStorage via `persist.ts`, `viewer` = OpenSeadragon + one canvas + RBush + clustering), `src/components/map/` (workspace, filter panel, search, popup, page shell). Dependencies added: `openseadragon` 6.1.1 (bundled, own types), `rbush` 4.0.1 + `@types/rbush`; nothing loads from a CDN. OpenSeadragon is imported dynamically (client only) and uses the 2D canvas drawer (the default WebGL drawer rendered blank in headless Chrome).
- **Filters:** Group -> subcategory -> classification, counts per map, tri-state parents, Select all / Clear all / Reset, entity-name language (8 client locales; no Thai exists). Pet/Mount/Fortress/Kisk and similar have no data in the client: shown disabled as "No data in client". Unclassified is off by default. The grouping is UI design in `lib/map/taxonomy.ts`; the classification ids come from the package.
- **Mark as Done:** only for `completable` classifications (Empyrean traces, chests, hidden cubes, seal dungeons...). `localStorage` key `aion2.map.done.v1.<map_id>` = list of spawn ids (a spawn id contains the map id and the client UniqueKey; it is per location, because one entity id such as a trace type has hundreds of locations). All / Not done / Done filter. Local only; no API, no table. Other keys: `aion2.map.filters.v1`, `aion2.map.names.v1` (listed on /cookie-policy; the policy version was not bumped).
- **Tests:** `node scripts/map-e2e/verify-map.cjs [baseUrl]` (headless Chrome via DevTools, no new dependencies; needs a running server). Results in `scripts/map-e2e/results.json`, screenshots in `scripts/map-e2e/evidence/`. `?mapdebug` in the URL exposes a read-only test hook.
- **Known limits:** 49 maps (3 more have no world-bounds data and are not offered); 343 of 1,629 monsters have a verified portrait (others get a neutral dot); 4 resources have no icon in the client; positions of spawn pools/multi-id entries are candidates; coordinates were validated against independent landmarks for World_D_A, World_L_A and Abyss_Reshanta_A only; performance measured on headless software rendering only. Thai UI strings exist; entity names stay English/other client locales.

## 6. Pending / not verified
- **Theme refresh not checked with real data.** It was tested on a throwaway copy with the proxy removed and every API call mocked: all pages plus dialogs, error, empty, member-role, mobile and Thai states, in both themes. The real login session, API icons and Firefox/Safari still need a manual look.
- **Not run against a live project yet.** The code passes typecheck, lint and build. The owner tests the UI and workflows manually: register → confirm → guild setup, join/create, members, refresh, history, party presets, image, settings, Data Management, reset password, TH/EN.
- **Blocked until `SUPABASE_SECRET_KEY` is set and 0006 is run** (see §4).
- **Restore from an export:** not implemented. Data Management shows it as "Not available yet".
- The old-browser localStorage import (presets and settings from the pre-server version) was removed from Data Management, because this is a fresh start.

## 7. Known caveats
- **Theme coverage limits:** verified in headless Chrome only, against mocked `/api/*` data (see §6). Real item icons and portraits from the API were not seen on the new surfaces; they sit on the `icon-well` token, which is a deep blue in both themes.
- **PNG export has one fixed palette** (`lib/party/export-png.ts`, matching the dark theme). It does not follow the viewer's theme, so shared images look the same for everyone.
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
- **Theming:**
  - `src/app/globals.css` holds every colour as a CSS variable, under `:root` (light) and `[data-theme="dark"]`. Change a colour there, and check both blocks.
  - Use the tokens, never hex or `white`/`black` utilities: `brand`, `brand-strong`, `brand-muted` (accent, was `gold*`); `gold`, `gold-text` (real gold, small accents only); `surface`, `surface-raised`, `surface-sunken`, `surface-hover`, `icon-well` (was `ink*`); `steel`, `subtle` (secondary text, was `steel/NN`); `success`, `warning`, `mystic`, `bronze` (marks) with their `-text` versions, and `danger-text`, `info-text`; `shadow-panel`, `shadow-frame`, `shadow-dialog`, `shadow-float`, `shadow-cta`.
  - **Accent roles:** `brand` / `arcane` = action, active state, focus. `gold` / `gold-text` = decoration and important highlights only (not every border). `mystic` / `mystic-text` = special badges, secondary highlights.
  - **Layers (use these, not one-off gradients):** `--panel-gradient`, `--panel-header`, `--panel-border`, `--card-gradient`, `--active-gradient`, `--bar-gradient`, `--cta-gradient`; gold: `--gold-rule` (hairline), `--gold-fade` (section divider), `--gold-fill` with `--on-gold` text (premium chip), `--gold-glow`. Use as `bg-[image:var(--panel-gradient)]`.
  - `StatCard` takes `tone` (`blue`, `cyan`, `purple`, `gold`). Keep `gold` for the headline stat.
  - **The app header is a nested `data-theme="dark"` scope**, so inside it `dark:` is always on. To follow the page's theme there, use the `page-dark:` variant (see `ThemeToggle`).
  - Don't dim text with opacity (`text-steel/50`): it fails contrast on light surfaces. Use `text-subtle`.
  - Class, rarity and grade colours stay as fixed hex data. When one is used as **text**, wrap it in `dataText(color)` from `lib/utils`, which adjusts it per theme.
  - Runtime: `lib/theme/script.ts` (inline script in the root layout, sets `<html data-theme>` before first paint), `lib/theme/index.ts` (store, `useTheme`, `setTheme`), `components/theme/` (`ThemeSync`, `ThemeToggle`). The storage key is `aion2-gc:theme`.
  - Fonts: Sora for headings (`font-heading`), Cinzel only for the ChumChon wordmark (`font-display`), Geist for body text.
- **Editing practice:** targeted edits only, no broad refactors, keep the AION identity and both themes. Don't invent API fields or game stats. Use "Combat Speed", not "Attack Speed". No NCSOFT assets (single owner-approved exception: the Interactive Map data under `public/map-data/`, see §5g).
- **Working style the owner expects:** stop after each step for review, and report changed files plus typecheck/lint/build results.

## 9. Next steps (priority order)
1. **Owner setup:**
   - add `SUPABASE_SECRET_KEY`
   - run 0006 to 0009 (0008 = feedback + DEV, then assign the DEV account, see §5b; 0009 = DEV tools, §5c)
   - set the Auth redirect URLs
   - optionally set up custom SMTP and `token_hash` email templates
2. **Manual UI/workflow tests** by the owner. Fix issues found.
3. **Later:**
   - restore from export
   - leadership transfer
   - leave guild
   - delete the unused `data/` folder and backup once Supabase is verified
