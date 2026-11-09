import { NextResponse } from "next/server";
import { EMAIL_RE, normalizeEmail } from "@/lib/accounts/users";
import { clientIp, rateLimit } from "@/lib/auth/config";
import { confirmUrl } from "@/lib/auth/site-url";
import { readJsonBody } from "@/lib/roster/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message, status: null } }, { status, headers: { "cache-control": "no-store" } });

/**
 * POST /api/auth/resend-confirmation — { email }
 * Asks Supabase Auth to send the signup confirmation email again (a new link; older
 * ones stop working). The answer is the same whether or not the email has an unconfirmed
 * account (no account enumeration). Limited per IP and per address.
 */
export async function POST(request: Request) {
  if (!rateLimit(`resend:${clientIp(request)}`, 10, 15 * 60 * 1000)) {
    return fail(429, "RATE_LIMITED", "Too many attempts. Wait a few minutes and try again.");
  }
  const body = await readJsonBody(request);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email.slice(0, 200)) : "";
  if (!EMAIL_RE.test(email) || email.length > 120) return fail(400, "INVALID_EMAIL", "Enter a valid email address.");
  if (!rateLimit(`resend-email:${email}`, 3, 15 * 60 * 1000)) {
    return fail(429, "RATE_LIMITED", "Too many attempts. Wait a few minutes and try again.");
  }

  const supabase = await createSupabaseServerClient({ persistent: false });
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: confirmUrl(request, "/guild-setup") } });
  if (error && (error.status === 429 || /rate limit/i.test(error.message))) {
    return fail(429, "EMAIL_RATE_LIMITED", "Too many emails were sent. Wait a while and try again.");
  }
  if (error && error.status && error.status >= 500) return fail(502, "AUTH_UNAVAILABLE", "The email service is unavailable. Try again later.");
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
