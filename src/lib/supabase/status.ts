/**
 * SERVER-ONLY: Supabase configuration / reachability for Settings → Data
 * Management. Never returns the URL or keys — only booleans, status codes and
 * timings. "Database" is checked with a real query as the signed-in user.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseAdminConfigured } from "./admin";
import { supabasePublicConfig } from "./config";

if (typeof window !== "undefined") {
  throw new Error("supabase/status is server-only.");
}

export type SupabaseReachability =
  | { configured: false }
  | {
      configured: true;
      /** Supabase Auth health endpoint answered OK. */
      reachable: boolean;
      httpStatus: number | null;
      checkedAt: string;
      latencyMs: number | null;
      /** A read of this guild's data succeeded (RLS applied). */
      database: { ok: boolean; latencyMs: number | null };
      /** Server-only secret key present (needed for character data writes). */
      serverAccess: boolean;
    };

export async function checkSupabaseReachability(sb: SupabaseClient, timeoutMs = 5000): Promise<SupabaseReachability> {
  const cfg = supabasePublicConfig();
  if (!cfg) return { configured: false };
  const started = Date.now();
  let reachable = false;
  let httpStatus: number | null = null;
  let latencyMs: number | null = null;
  try {
    const res = await fetch(`${cfg.url}/auth/v1/health`, {
      headers: { apikey: cfg.publishableKey },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    reachable = res.ok;
    httpStatus = res.status;
    latencyMs = Date.now() - started;
  } catch {
    /* unreachable */
  }
  const dbStart = Date.now();
  const { error } = await sb.rpc("guild_data_overview");
  return {
    configured: true,
    reachable,
    httpStatus,
    checkedAt: new Date().toISOString(),
    latencyMs,
    database: { ok: !error, latencyMs: error ? null : Date.now() - dbStart },
    serverAccess: isSupabaseAdminConfigured(),
  };
}
