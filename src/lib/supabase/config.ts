/**
 * Supabase configuration (public values only).
 *
 * Supabase is the app's only live persistence (Auth, PostgreSQL, Storage).
 * Clients: ./server.ts (user, RLS), ./proxy.ts (session refresh),
 * ./admin.ts (server-only secret key for the service_role functions).
 *
 * Only the project URL and the publishable (anon) key are read here; both are
 * designed to be public and are protected by Row Level Security. A secret /
 * service_role key must NEVER be referenced by a NEXT_PUBLIC_ variable or by
 * client code.
 */

export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}

/** The configured project, or null when either variable is missing / malformed. */
export function supabasePublicConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.hostname !== "127.0.0.1" && u.hostname !== "localhost") return null;
  } catch {
    return null;
  }
  return { url: url.replace(/\/+$/, ""), publishableKey };
}

export const isSupabaseConfigured = () => supabasePublicConfig() !== null;
