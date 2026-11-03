/**
 * SERVER-ONLY Supabase client with the secret (service_role) key — bypasses RLS.
 *
 * Use ONLY where the schema requires it (supabase/migrations/*_rpc_functions.sql):
 *   - upsert_character_from_api / record_character_refresh_error /
 *     record_character_snapshot (AION 2 API data must come from this server),
 *   - the one-off JSON → Supabase import (Auth Admin API).
 * Every caller must already have checked the user's permission itself.
 *
 * The key is read from SUPABASE_SECRET_KEY (never NEXT_PUBLIC_*), is never
 * logged and never returned to the browser.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "./config";

if (typeof window !== "undefined") {
  throw new Error("supabase/admin is server-only.");
}

export class SupabaseAdminNotConfiguredError extends Error {
  constructor(reason: string) {
    super(`Supabase server access is not configured: ${reason}`);
    this.name = "SupabaseAdminNotConfiguredError";
  }
}

/** Why the admin client can't be created, or null when it can. Never includes the key. */
export function supabaseAdminConfigProblem(): string | null {
  if (!supabasePublicConfig()) return "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are missing or invalid.";
  for (const name of Object.keys(process.env)) {
    if (name.startsWith("NEXT_PUBLIC_") && /SECRET|SERVICE_ROLE/i.test(name)) {
      return `${name} looks like a secret key exposed to the browser. Remove it and use SUPABASE_SECRET_KEY.`;
    }
  }
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key) return "SUPABASE_SECRET_KEY is not set (server-only, in .env.local).";
  if (key.startsWith("sb_publishable_")) return "SUPABASE_SECRET_KEY contains a publishable key, not a secret key.";
  return null;
}

export const isSupabaseAdminConfigured = () => supabaseAdminConfigProblem() === null;

/**
 * For Route Handlers: the configuration problem (logged on the server only —
 * the browser gets a generic message), or null when server writes are possible.
 */
export function serverWriteProblem(): string | null {
  const problem = supabaseAdminConfigProblem();
  if (problem) console.error(`[supabase] server writes unavailable: ${problem}`);
  return problem;
}

const KEY = Symbol.for("aion2-gc.supabase-admin");

export function supabaseAdmin(): SupabaseClient {
  const problem = supabaseAdminConfigProblem();
  if (problem) throw new SupabaseAdminNotConfiguredError(problem);
  const g = globalThis as unknown as Record<symbol, SupabaseClient | undefined>;
  return (g[KEY] ??= createClient(supabasePublicConfig()!.url, process.env.SUPABASE_SECRET_KEY!.trim(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
}
