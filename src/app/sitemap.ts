import type { MetadataRoute } from "next";

const SITE_URL = "https://justkiddinglab.com";

/**
 * Only pages reachable without signing in (see OPEN_PAGES / PUBLIC_PAGES in src/proxy.ts).
 * "/" is left out (it redirects to /login or the dashboard), as are the signed-in app pages,
 * /reset-password, /suspended, /auth/confirm and /api/*.
 */
const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/support", "/cookie-policy"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({ url: `${SITE_URL}${path}` }));
}
