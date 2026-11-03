/**
 * SERVER-ONLY: the app origin used in Supabase Auth email links.
 * SITE_URL (optional, e.g. https://guild.example.com) wins; otherwise the
 * request's own origin. The resulting URL must be listed under
 * Supabase → Authentication → URL Configuration → Redirect URLs.
 */

if (typeof window !== "undefined") {
  throw new Error("auth/site-url is server-only.");
}

export function siteOrigin(request: Request): string {
  const env = process.env.SITE_URL?.trim();
  if (env) {
    try {
      return new URL(env).origin;
    } catch {
      /* fall through */
    }
  }
  return new URL(request.url).origin;
}

/** Link target for confirmation / recovery emails (handled by app/auth/confirm/route.ts). */
export const confirmUrl = (request: Request, next: string) => `${siteOrigin(request)}/auth/confirm?next=${encodeURIComponent(next)}`;
