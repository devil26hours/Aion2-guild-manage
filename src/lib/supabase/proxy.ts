/**
 * SERVER-ONLY helper for src/proxy.ts: refreshes the Supabase Auth session
 * cookies on each request (@supabase/ssr pattern) and verifies the user.
 */

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { NO_GUILD_META_KEY } from "@/lib/auth/no-guild";
import { supabasePublicConfig } from "./config";
import { authCookieOptions, isPersistent, REMEMBER_COOKIE } from "./cookies";

if (typeof window !== "undefined") {
  throw new Error("supabase/proxy is server-only.");
}

/**
 * Returns the response to continue with (carrying refreshed auth cookies), the
 * request-bound client, and the verified Supabase user id (null when signed
 * out or not configured). Copy `response` cookies onto any redirect you return
 * (see `withSessionCookies`).
 */
export async function updateSupabaseSession(
  request: NextRequest,
): Promise<{ response: NextResponse; supabase: SupabaseClient | null; userId: string | null; noGuildChosen: boolean }> {
  let response = NextResponse.next({ request });
  const cfg = supabasePublicConfig();
  if (!cfg) return { response, supabase: null, userId: null, noGuildChosen: false };
  const persistent = isPersistent(request.cookies.get(REMEMBER_COOKIE)?.value);

  const supabase = createServerClient(cfg.url, cfg.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(toSet, headers) {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, authCookieOptions(options, persistent)));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // getClaims() verifies the JWT; do not trust getSession() on the server.
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  const meta = data?.claims?.user_metadata as Record<string, unknown> | undefined;
  return { response, supabase, userId: typeof sub === "string" ? sub : null, noGuildChosen: meta?.[NO_GUILD_META_KEY] === true };
}

/** Carry refreshed auth cookies (and cache headers) over to a redirect/JSON response. */
export function withSessionCookies<T extends NextResponse>(from: NextResponse, to: T): T {
  from.cookies.getAll().forEach((c) => to.cookies.set(c));
  const cc = from.headers.get("cache-control");
  if (cc) to.headers.set("cache-control", cc);
  return to;
}
