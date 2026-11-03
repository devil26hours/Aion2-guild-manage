import { NextResponse, type NextRequest } from "next/server";
import { LEGACY_SESSION_COOKIE } from "@/lib/supabase/cookies";
import { updateSupabaseSession, withSessionCookies } from "@/lib/supabase/proxy";

/**
 * Route protection (Next.js 16 Proxy, Node.js runtime).
 *
 * - Refreshes the Supabase Auth session cookies and verifies the JWT (getClaims).
 * - Public pages: /login, /register (signed-in users are sent on),
 *   /forgot-password and the email-link handler /auth/confirm.
 * - /reset-password needs a session (the recovery link signs the user in) but no guild.
 * - Public APIs: login, logout, register, forgot-password and the registration character search.
 * - Every other page/API needs a valid session.
 * - Signed-in users without a guild can only use /guild-setup (and the APIs
 *   it needs — guild handlers enforce membership/leader rights themselves).
 * This is only the first line of defense: Route Handlers and RLS re-check.
 */

const PUBLIC_PAGES = new Set(["/login", "/register"]);
const OPEN_PAGES = new Set(["/forgot-password", "/auth/confirm"]);
const NO_GUILD_PAGES = new Set(["/reset-password"]);
const PUBLIC_API = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/character-search",
]);
const SETUP = "/guild-setup";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { response, supabase, userId } = await updateSupabaseSession(request).catch(() => ({ response: NextResponse.next({ request }), supabase: null, userId: null }));
  if (request.cookies.has(LEGACY_SESSION_COOKIE)) response.cookies.delete(LEGACY_SESSION_COOKIE);
  const redirect = (to: string) => withSessionCookies(response, NextResponse.redirect(new URL(to, request.url)));

  if (OPEN_PAGES.has(pathname)) return response;

  // Guild membership (own row only — RLS). One small query per signed-in request.
  let hasGuild = false;
  if (userId && supabase && !pathname.startsWith("/api/")) {
    const { data } = await supabase.from("guild_memberships").select("guild_id").eq("user_id", userId).maybeSingle();
    hasGuild = !!data;
  }

  if (PUBLIC_PAGES.has(pathname)) {
    if (!userId) return response;
    return redirect(hasGuild ? "/dashboard" : SETUP);
  }

  if (pathname.startsWith("/api/")) {
    if (userId || PUBLIC_API.has(pathname)) return response;
    return withSessionCookies(
      response,
      NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in required.", status: null } },
        { status: 401, headers: { "cache-control": "no-store" } },
      ),
    );
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
