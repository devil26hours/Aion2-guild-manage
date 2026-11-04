/**
 * SERVER-ONLY GUEST session. A guest has no Supabase account and no database access at all:
 * the only thing they hold is an httpOnly cookie signed by the server (HMAC-SHA256, expiring).
 * It is verified by the proxy and by the one Route Handler guests may call, so a guest can't
 * widen their own access by editing the cookie or by calling other APIs directly.
 *
 * The signing key is derived from the server-only SUPABASE_SECRET_KEY (domain-separated), so
 * no extra environment variable is needed. Without that key, guest access is disabled.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

if (typeof window !== "undefined") {
  throw new Error("auth/guest is server-only.");
}

export const GUEST_COOKIE = "aion2_guest";
export const GUEST_TTL_SECONDS = 8 * 60 * 60;

/** The AION2 proxy endpoints Character Lookup uses; nothing else is reachable by a guest. */
export const GUEST_ENDPOINTS: ReadonlySet<string> = new Set(["servers-roster", "character-search", "character-profile", "character-equipment-item"]);

function signingKey(): string | null {
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secret || secret.startsWith("sb_publishable_")) return null;
  return createHmac("sha256", secret).update("aion2-gc/guest-session/v1").digest("hex");
}

export const isGuestAccessAvailable = () => signingKey() !== null;

const sign = (key: string, payload: string) => createHmac("sha256", key).update(payload).digest("base64url");

/** A new signed guest token, or null when guest access isn't configured. */
export function createGuestToken(now = Date.now()): string | null {
  const key = signingKey();
  if (!key) return null;
  const payload = Buffer.from(JSON.stringify({ r: "guest", exp: Math.floor(now / 1000) + GUEST_TTL_SECONDS })).toString("base64url");
  return `${payload}.${sign(key, payload)}`;
}

/** True only for an untampered, unexpired guest token. */
export function verifyGuestToken(token: string | undefined | null, now = Date.now()): boolean {
  const key = signingKey();
  if (!key || !token || token.length > 256) return false;
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra !== undefined) return false;
  const expected = Buffer.from(sign(key, payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { r?: unknown; exp?: unknown };
    return body.r === "guest" && typeof body.exp === "number" && body.exp * 1000 > now;
  } catch {
    return false;
  }
}

/** The API paths a guest may call: the allowlisted lookup endpoints, plus the public auth helpers. */
export function isGuestApiPath(pathname: string): boolean {
  const m = /^\/api\/aion2\/([a-z0-9-]+)$/.exec(pathname);
  return !!m && GUEST_ENDPOINTS.has(m[1]);
}

export function guestCookieOptions(secure: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: GUEST_TTL_SECONDS };
}
