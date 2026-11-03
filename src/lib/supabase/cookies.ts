/**
 * Supabase Auth cookie options shared by the server client and the proxy.
 *
 * "Remember me" (login form): Supabase's own auth cookies are long-lived by
 * default. When the user did NOT tick "remember me", the session should end
 * with the browser — so every auth cookie is rewritten as a session cookie
 * (no maxAge / expires). The choice is kept in REMEMBER_COOKIE (no secret,
 * just "1" or "0") so token refreshes in the proxy keep the same behaviour.
 */

import type { CookieOptions } from "@supabase/ssr";

export const REMEMBER_COOKIE = "aion2_remember";
/** Old JSON-session cookie name: deleted on sign-in/out so browsers stop sending it. */
export const LEGACY_SESSION_COOKIE = "aion2_session";

export const isPersistent = (value: string | undefined | null) => value === "1";

export function authCookieOptions(options: CookieOptions, persistent: boolean): CookieOptions {
  const base: CookieOptions = { ...options, path: options.path ?? "/", sameSite: options.sameSite ?? "lax" };
  // A removal (maxAge 0) must stay a removal.
  if (persistent || options.maxAge === 0) return base;
  const { maxAge: _maxAge, expires: _expires, ...session } = base;
  void _maxAge;
  void _expires;
  return session;
}

export function rememberCookieOptions(persistent: boolean, secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    ...(persistent ? { maxAge: 400 * 24 * 60 * 60 } : {}),
  };
}
