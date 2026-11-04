import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/auth/config";
import { createGuestToken, GUEST_COOKIE, guestCookieOptions } from "@/lib/auth/guest";

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message, status: null } }, { status, headers: { "cache-control": "no-store" } });

/**
 * POST /api/auth/guest — starts a GUEST session (public). The reply sets a signed, expiring,
 * httpOnly cookie; the proxy and the AION2 proxy route verify it on every request. A guest has
 * no account and no database access, and can only use Character Lookup.
 */
export async function POST(request: Request) {
  if (!rateLimit(`guest:${clientIp(request)}`, 30, 10 * 60 * 1000)) {
    return fail(429, "RATE_LIMITED", "Too many attempts. Wait a few minutes and try again.");
  }
  const token = createGuestToken();
  if (!token) return fail(503, "NOT_CONFIGURED", "Guest access is not available right now.");
  const secure = process.env.NODE_ENV === "production" && new URL(request.url).protocol === "https:";
  (await cookies()).set(GUEST_COOKIE, token, guestCookieOptions(secure));
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
