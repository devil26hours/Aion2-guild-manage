import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/accounts/users";
import { claimPendingCharacter } from "@/lib/auth/claim";
import { clientIp, failDelay, rateLimit } from "@/lib/auth/config";
import { readJsonBody } from "@/lib/roster/http";
import { LEGACY_SESSION_COOKIE, REMEMBER_COOKIE, rememberCookieOptions } from "@/lib/supabase/cookies";
import { createSupabaseServerClient, SupabaseNotConfiguredError } from "@/lib/supabase/server";

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message, status: null } }, { status, headers: { "cache-control": "no-store" } });

/**
 * POST /api/auth/login — { email, password, remember? }
 * Signs in with Supabase Auth (password verified by Supabase, never stored
 * here). The session lives in httpOnly Supabase auth cookies; without
 * "remember me" they are browser-session cookies. A character chosen at
 * registration is claimed here if the confirmation link did not do it.
 */
export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email.slice(0, 200)) : "";
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  const remember = body?.remember === true;

  if (!rateLimit(`login:${clientIp(request)}`, 20, 10 * 60 * 1000)) {
    return fail(429, "RATE_LIMITED", "Too many sign-in attempts. Wait a few minutes and try again.");
  }
  if (!email || !password) {
    await failDelay();
    return fail(401, "INVALID_CREDENTIALS", "Invalid email or password. Access to the Guild Hall was denied.");
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient({ persistent: remember });
  } catch (e) {
    if (e instanceof SupabaseNotConfiguredError) return fail(503, "NOT_CONFIGURED", "The server is not fully configured for database access.");
    throw e;
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.code === "email_not_confirmed") return fail(403, "EMAIL_NOT_CONFIRMED", "Confirm your email address first — check your inbox for the confirmation link.");
    if (error?.status === 429 || error?.code === "over_request_rate_limit") return fail(429, "RATE_LIMITED", "Too many sign-in attempts. Wait a few minutes and try again.");
    if (error && error.status && error.status >= 500) return fail(502, "AUTH_UNAVAILABLE", "The sign-in service is unavailable. Try again later.");
    await failDelay();
    return fail(401, "INVALID_CREDENTIALS", "Invalid email or password. Access to the Guild Hall was denied.");
  }

  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production" && new URL(request.url).protocol === "https:";
  cookieStore.set(REMEMBER_COOKIE, remember ? "1" : "0", rememberCookieOptions(remember, secure));
  cookieStore.delete(LEGACY_SESSION_COOKIE);

  await claimPendingCharacter(supabase).catch(() => "failed");
  const { data: m } = await supabase.from("guild_memberships").select("guild_id").eq("user_id", data.user.id).maybeSingle();
  return NextResponse.json({ ok: true, has_guild: !!m }, { headers: { "cache-control": "no-store" } });
}
