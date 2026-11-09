import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { siteOrigin } from "@/lib/auth/site-url";
import { claimPendingCharacter } from "@/lib/auth/claim";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /auth/confirm — target of Supabase Auth email links.
 *
 * Accepts both link styles:
 *   ?token_hash=…&type=signup|email|recovery|…   (recommended email template:
 *      {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/guild-setup
 *      — works in any browser)
 *   ?code=…   (default template, PKCE — must be opened in the browser that registered)
 *
 * Email confirmation → the session is created, then the character chosen at
 * registration is claimed (lib/auth/claim). Recovery → /reset-password.
 */

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/** Only same-origin app paths. */
function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || raw.startsWith("/api/") || raw.startsWith("/auth/")) return null;
  return raw;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  const type = OTP_TYPES.find((t) => t === rawType) ?? null;
  const go = (path: string) => NextResponse.redirect(new URL(path, siteOrigin(request)));

  if (url.searchParams.get("error_code") || url.searchParams.get("error")) return go("/login?confirm=failed");

  const supabase = await createSupabaseServerClient({ persistent: false });
  const recovery = type === "recovery" || next === "/reset-password";
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return go(recovery ? "/forgot-password?link=expired" : "/login?confirm=failed");
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return go(recovery ? "/forgot-password?link=expired" : "/login?confirm=failed");
  } else {
    return go("/login");
  }

  if (recovery) return go("/reset-password");

  await claimPendingCharacter(supabase).catch(() => "failed");
  const { data: u } = await supabase.auth.getUser();
  const { data: m } = u.user ? await supabase.from("guild_memberships").select("guild_id").eq("user_id", u.user.id).maybeSingle() : { data: null };
  return go(m ? "/dashboard" : (next ?? "/guild-setup"));
}
