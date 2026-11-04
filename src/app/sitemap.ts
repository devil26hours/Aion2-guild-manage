import type { MetadataRoute } from "next";

const SITE_URL = "https://justkiddinglab.com";

/**
 * Pages worth indexing that are reachable without signing in (see src/proxy.ts). /login is the
 * landing page ("/" redirects to it). Left out: "/" (redirect), /register and /forgot-password
 * (no search value), the signed-in app pages, /reset-password, /suspended, /auth/confirm, /api/*.
 */
const PUBLIC_PATHS = ["/login", "/map", "/support", "/cookie-policy"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({ url: `${SITE_URL}${path}` }));
}
