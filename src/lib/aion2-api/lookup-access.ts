/**
 * SERVER-ONLY access gate for the Character Lookup endpoints under /api/aion2.
 * Shared by the upstream proxy (/api/aion2/[endpoint]) and the Character
 * Directory route (/api/aion2/character-directory), so both apply exactly the
 * same rules:
 *
 * - Signed-in account with a guild: every allowlisted endpoint.
 * - Signed-in account without a guild ("No Guild"): the lookup endpoints only.
 * - No account session: the lookup endpoints are Public Access (any visitor,
 *   GUEST cookie or none), rate-limited per client IP (90/min; item details
 *   120/min in their own bucket), as long as the only
 *   reason auth failed was "not signed in" (401) — a suspended or misconfigured
 *   account (403/503) stays denied.
 */

import { NextResponse, type NextRequest } from "next/server";
import { clientIp, rateLimit } from "@/lib/auth/config";
import { requireUser } from "@/lib/auth/context";
import { GUEST_COOKIE, GUEST_ENDPOINTS, verifyGuestToken } from "@/lib/auth/guest";

if (typeof window !== "undefined") {
  throw new Error("aion2-api/lookup-access is server-only.");
}

const deny = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message, status: null } }, { status, headers: { "cache-control": "no-store" } });

/** A response to send instead of serving `endpoint`, or null when the caller may proceed. */
export async function lookupAccessDenied(request: NextRequest, endpoint: string): Promise<NextResponse | null> {
  const auth = await requireUser(request);
  if (!auth.response && !auth.user.guild_id && !GUEST_ENDPOINTS.has(endpoint)) {
    return deny(403, "NO_GUILD", "Join or create a guild first.");
  }
  if (auth.response) {
    if (auth.response.status !== 401 || !GUEST_ENDPOINTS.has(endpoint)) {
      const guest = auth.response.status === 401 && verifyGuestToken(request.cookies.get(GUEST_COOKIE)?.value);
      if (guest) return deny(403, "GUEST_FORBIDDEN", "Guests can only use Character Lookup.");
      return auth.response;
    }
    // Item details have their own budget: one opened profile preloads one request per
    // equipped item (~20), which would otherwise use up the search/profile budget.
    const bucket = endpoint === "character-equipment-item" ? "public-items" : "public-api";
    const max = endpoint === "character-equipment-item" ? 120 : 90;
    if (!rateLimit(`${bucket}:${clientIp(request)}`, max, 60 * 1000)) {
      return deny(429, "RATE_LIMITED", "Too many requests. Wait a moment and try again.");
    }
  }
  return null;
}
