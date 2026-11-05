import type { MetadataRoute } from "next";

const SITE_URL = "https://justkiddinglab.com";

/**
 * Pages worth indexing that are reachable without signing in (see src/proxy.ts). "/" is the
 * public Welcome page; /character-lookup is Public Access (no login or guest session needed).
 * Left out: /register and /forgot-password (no search value), the signed-in app pages,
 * /reset-password, /suspended, /auth/confirm, /api/*.
 */
const PUBLIC_PATHS = ["/", "/login", "/character-lookup", "/map", "/support", "/cookie-policy"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({ url: `${SITE_URL}${path}` }));
}
