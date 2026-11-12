import { NextResponse, type NextRequest } from "next/server";
import { isDeveloper } from "@/lib/auth/developer";
import { siteOrigin } from "@/lib/auth/site-url";
import { GUEST_COOKIE, isGuestApiPath, verifyGuestToken } from "@/lib/auth/guest";
import { LEGACY_SESSION_COOKIE } from "@/lib/supabase/cookies";
import { updateSupabaseSession, withSessionCookies } from "@/lib/supabase/proxy";

/**
 * Route protection (Next.js 16 Proxy, Node.js runtime).
 *
 * - Refreshes the Supabase Auth session cookies and verifies the JWT (getClaims).
 * - Public pages: /login, /register (signed-in users are sent on),
 *   /forgot-password, the email-link handler /auth/confirm /support, /cookie-policy and the Interactive Map /map (open to guests too).
 * - / is the public Welcome page: signed-out visitors (including a GUEST) and signed-in DEV
 *   accounts see it; every other signed-in account is sent on exactly as /login already does
 *   (dashboard, or guild-setup/character-lookup when it has no guild yet).
 * - /reset-password needs a session (the recovery link signs the user in) but no guild.
 * - Public APIs: login, logout, register, forgot-password, the registration character search and feedback submission.
 * - Every other page/API needs a valid session.
 * - Character Lookup is Public Access: ANY signed-out visitor — GUEST cookie or none at all —
 *   reaches /character-lookup directly (rewritten to the shell-less /guest-lookup page, share-link
 *   query string intact), and the allowlisted AION2 lookup endpoints answer with no cookie needed.
 * - A GUEST (signed cookie, no account) gets that same Public Access, plus every other page
 *   redirects to /character-lookup and every other API gets 403 (vs. 401 for a bare anonymous visitor).
 * - Signed-in users without a guild ("No Guild") have Guest-equivalent page access — Character Lookup,
 *   plus /support and /cookie-policy — and the Guild Management page /guild-setup (create or join a guild).
 *   They stay signed in. Every guild page redirects to /guild-setup; guild APIs answer 403 NO_GUILD
 *   (requireGuild), and /api/aion2 limits them to the lookup endpoints.
 * This is only the first line of defense: Route Handlers and RLS re-check.
 */

const PUBLIC_PAGES = new Set(["/login", "/register"]);
const OPEN_PAGES = new Set(["/forgot-password", "/auth/confirm", "/suspended", "/support", "/cookie-policy", "/map"]);
const NO_GUILD_PAGES = new Set(["/reset-password"]);
const PUBLIC_API = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/resend-confirmation",
  "/api/auth/character-search",
  "/api/auth/guest",
  // Feedback may be sent signed out; the handler validates, rate-limits and reads the session itself.
  "/api/feedback",
  // Background refresh (Railway Cron): no session; the handler requires the CRON_SECRET bearer token.
  "/api/cron/refresh-characters",
]);
const SETUP = "/guild-setup";
const LOOKUP = "/character-lookup";
const GUEST_LOOKUP = "/guest-lookup";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { response, supabase, userId, noGuildChosen } = await updateSupabaseSession(request).catch(() => ({ response: NextResponse.next({ request }), supabase: null, userId: null, noGuildChosen: false }));
  if (request.cookies.has(LEGACY_SESSION_COOKIE)) response.cookies.delete(LEGACY_SESSION_COOKIE);
  const redirect = (to: string) => withSessionCookies(response, NextResponse.redirect(new URL(to, siteOrigin(request))));
  // A valid guest cookie only counts when there is no real session.
  const guest = !userId && verifyGuestToken(request.cookies.get(GUEST_COOKIE)?.value);

  // The guest page is an internal target: it is only ever reached through the rewrite below.
  if (pathname === GUEST_LOOKUP) return redirect(LOOKUP);

  if (OPEN_PAGES.has(pathname)) return response;

  // Guild membership (own row only — RLS). One small query per signed-in request.
  let hasGuild = false;
  let suspended = false;
  if (userId && supabase && !pathname.startsWith("/api/")) {
    const [membership, suspension] = await Promise.all([
      supabase.from("guild_memberships").select("guild_id").eq("user_id", userId).maybeSingle(),
      supabase.from("user_suspensions").select("user_id").eq("user_id", userId).maybeSingle(),
    ]);
    hasGuild = !!membership.data;
    suspended = !suspension.error && !!suspension.data; // handlers re-check on every API call
  }
  // Suspended accounts see only the notice page (it offers a log-out button).
  if (suspended) return redirect("/suspended");

  // Welcome page: signed-out visitors (anonymous or GUEST) and DEV accounts see it as-is;
  // every other signed-in account is routed on exactly like the PUBLIC_PAGES case below.
  if (pathname === "/") {
    if (!userId) return response;
    if (supabase && (await isDeveloper(supabase))) return response;
    return redirect(hasGuild ? "/dashboard" : noGuildChosen ? LOOKUP : SETUP);
  }

  if (PUBLIC_PAGES.has(pathname)) {
    if (!userId) return response;
    return redirect(hasGuild ? "/dashboard" : noGuildChosen ? LOOKUP : SETUP);
  }

  if (pathname.startsWith("/api/")) {
    // The allowlisted AION2 lookup endpoints carry only public character data (Public Access):
    // open to every caller, signed in or not, GUEST cookie or not.
    if (userId || PUBLIC_API.has(pathname) || isGuestApiPath(pathname)) return response;
    if (guest) {
      return withSessionCookies(
        response,
        NextResponse.json(
          { error: { code: "GUEST_FORBIDDEN", message: "Guests can only use Character Lookup.", status: null } },
          { status: 403, headers: { "cache-control": "no-store" } },
        ),
      );
    }
    return withSessionCookies(
      response,
      NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in required.", status: null } },
        { status: 401, headers: { "cache-control": "no-store" } },
      ),
    );
  }

  // Character Lookup is Public Access: any signed-out visitor — GUEST cookie or none — lands on
  // the shell-less lookup page directly, with its share-link query string preserved.
  if (!userId && pathname === LOOKUP) {
    const guestLookup = new URL(GUEST_LOOKUP, request.url);
    guestLookup.search = search;
    return withSessionCookies(response, NextResponse.rewrite(guestLookup));
  }

  if (guest) return redirect(LOOKUP);

  if (!userId) {
    const login = new URL("/login", siteOrigin(request));
    if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
    return withSessionCookies(response, NextResponse.redirect(login));
  }

  if (NO_GUILD_PAGES.has(pathname)) return response;
  // Not in a guild: Guild Management and Character Lookup only. Accounts that already chose "Continue Without a Guild" land on Character Lookup.
  if (!hasGuild && pathname !== SETUP && pathname !== LOOKUP) return redirect(noGuildChosen ? LOOKUP : SETUP);
  if (hasGuild && pathname === SETUP) return redirect("/dashboard");
  return response;
}

export const config = {
  // Everything except Next.js internals, the favicon and public files (paths with an extension).
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.[A-Za-z0-9]+$).*)"],
};
