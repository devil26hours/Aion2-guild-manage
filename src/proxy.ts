import { NextResponse, type NextRequest } from "next/server";
import { GUEST_COOKIE, isGuestApiPath, verifyGuestToken } from "@/lib/auth/guest";
import { LEGACY_SESSION_COOKIE } from "@/lib/supabase/cookies";
import { updateSupabaseSession, withSessionCookies } from "@/lib/supabase/proxy";

/**
 * Route protection (Next.js 16 Proxy, Node.js runtime).
 *
 * - Refreshes the Supabase Auth session cookies and verifies the JWT (getClaims).
 * - Public pages: /login, /register (signed-in users are sent on),
 *   /forgot-password and the email-link handler /auth/confirm.
 * - /reset-password needs a session (the recovery link signs the user in) but no guild.
 * - Public APIs: login, logout, register, forgot-password, the registration character search and feedback submission.
 * - Every other page/API needs a valid session.
 * - A GUEST (signed cookie, no account) may only use Character Lookup and the allowlisted
 *   AION2 lookup endpoints; every other page redirects to /character-lookup, every other API gets 403.
 *   /character-lookup is rewritten to the shell-less /guest-lookup page for guests.
 * - Signed-in users without a guild can only use /guild-setup (and the APIs
 *   it needs — guild handlers enforce membership/leader rights themselves).
 * This is only the first line of defense: Route Handlers and RLS re-check.
 */

const PUBLIC_PAGES = new Set(["/login", "/register"]);
const OPEN_PAGES = new Set(["/forgot-password", "/auth/confirm", "/suspended"]);
const NO_GUILD_PAGES = new Set(["/reset-password"]);
const PUBLIC_API = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/character-search",
  "/api/auth/guest",
  // Feedback may be sent signed out; the handler validates, rate-limits and reads the session itself.
  "/api/feedback",
]);
const SETUP = "/guild-setup";
const LOOKUP = "/character-lookup";
const GUEST_LOOKUP = "/guest-lookup";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { response, supabase, userId } = await updateSupabaseSession(request).catch(() => ({ response: NextResponse.next({ request }), supabase: null, userId: null }));
  if (request.cookies.has(LEGACY_SESSION_COOKIE)) response.cookies.delete(LEGACY_SESSION_COOKIE);
  const redirect = (to: string) => withSessionCookies(response, NextResponse.redirect(new URL(to, request.url)));
  // A valid guest cookie only counts when there is no real session.
  const guest = !userId && verifyGuestToken(request.cookies.get(GUEST_COOKIE)?.value);

  // The guest page is an internal target: it is only ever reached through the rewrite below.
  if (pathname === GUEST_LOOKUP) return redirect(userId || guest ? LOOKUP : `/login?next=${encodeURIComponent(LOOKUP)}`);

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

  if (PUBLIC_PAGES.has(pathname)) {
    if (!userId) return response;
    return redirect(hasGuild ? "/dashboard" : SETUP);
  }

  if (pathname.startsWith("/api/")) {
    if (userId || PUBLIC_API.has(pathname)) return response;
    if (guest) {
      if (isGuestApiPath(pathname)) return response;
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

  if (guest) {
    if (pathname === LOOKUP) return withSessionCookies(response, NextResponse.rewrite(new URL(GUEST_LOOKUP, request.url)));
    return redirect(LOOKUP);
  }

  if (!userId) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
    return withSessionCookies(response, NextResponse.redirect(login));
  }

  if (NO_GUILD_PAGES.has(pathname)) return response;
  // Signed in: without a guild only the guild setup page is available.
  if (!hasGuild && pathname !== SETUP) return redirect(SETUP);
  if (hasGuild && pathname === SETUP) return redirect("/dashboard");
  return response;
}

export const config = {
  // Everything except Next.js internals, the favicon and public files (paths with an extension).
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.[A-Za-z0-9]+$).*)"],
};
