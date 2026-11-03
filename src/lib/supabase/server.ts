/**
 * SERVER-ONLY Supabase client bound to the request's auth cookies
 * (@supabase/ssr). For Server Components, Server Functions and Route Handlers.
 *
 * It acts as the signed-in Supabase user, so every query is subject to RLS
 * (supabase/migrations/*_rls_policies.sql). This is the client every Route
 * Handler uses for guild data; the secret-key client (./admin.ts) is only for
 * the few service_role-only writes.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicConfig } from "./config";
import { authCookieOptions, isPersistent, REMEMBER_COOKIE } from "./cookies";

if (typeof window !== "undefined") {
  throw new Error("supabase/server is server-only.");
}

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).");
    this.name = "SupabaseNotConfiguredError";
  }
}

/**
 * `persistent` overrides the remembered "remember me" choice — used by the
 * login route before the REMEMBER_COOKIE of this request exists.
 */
export async function createSupabaseServerClient(opts: { persistent?: boolean } = {}) {
  const cfg = supabasePublicConfig();
  if (!cfg) throw new SupabaseNotConfiguredError();
  const cookieStore = await cookies();
  const persistent = opts.persistent ?? isPersistent(cookieStore.get(REMEMBER_COOKIE)?.value);
  return createServerClient(cfg.url, cfg.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, authCookieOptions(options, persistent)));
        } catch {
          // Called from a Server Component (cookies are read-only there).
          // Session refresh is handled by the proxy (src/proxy.ts → ./proxy.ts).
        }
      },
    },
  });
}
