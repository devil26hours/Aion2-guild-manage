import { NextResponse } from "next/server";
import { EMAIL_RE, normalizeEmail } from "@/lib/accounts/users";
import { clientIp, rateLimit } from "@/lib/auth/config";
import { confirmUrl } from "@/lib/auth/site-url";
import { readJsonBody } from "@/lib/roster/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message, status: null } }, { status, headers: { "cache-control": "no-store" } });

/**
 * POST /api/auth/forgot-password — { email }
 * Asks Supabase Auth to email a password-reset link (→ /auth/confirm →
 * /reset-password). The answer is the same whether or not the email has an
 * account (no account enumeration).
 */
export async function POST(request: Request) {
  if (!rateLimit(`forgot:${clientIp(request)}`, 5, 15 * 60 * 1000)) {
    return fail(429, "RATE_LIMITED", "Too many attempts. Wait a few minutes and try again.");
  }
  const body = await readJsonBody(request);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email.slice(0, 200)) : "";
  if (!EMAIL_RE.test(email)) return fail(400, "INVALID_EMAIL", "Enter a valid email address.");

  const supabase = await createSupabaseServerClient({ persistent: false });
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: confirmUrl(request, "/reset-password") });
  if (error && (error.status === 429 || /rate limit/i.test(error.message))) {
    return fail(429, "EMAIL_RATE_LIMITED", "Too many emails were sent. Wait a while and try again.");
  }
  if (error && error.status && error.status >= 500) return fail(502, "AUTH_UNAVAILABLE", "The email service is unavailable. Try again later.");
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
