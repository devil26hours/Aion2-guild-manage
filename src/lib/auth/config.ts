/**
 * SERVER-ONLY authentication configuration. Never sent to the browser.
 *
 * Accounts are Supabase Auth users; no login credentials are configured here.
 *   API_LAB_PASSWORD            — the API Lab gate (development fallback below).
 */

import { createHash, timingSafeEqual } from "node:crypto";

if (typeof window !== "undefined") {
  throw new Error("auth/config is server-only.");
}

const DEV_API_LAB_PASSWORD = "aion2-lab-dev";

const apiLabPassword = () => process.env.API_LAB_PASSWORD || DEV_API_LAB_PASSWORD;

/** Constant-time string comparison (hashing first equalizes lengths). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

export function checkApiLabPassword(password: string): boolean {
  return safeEqual(password, apiLabPassword());
}

/** Small fixed delay for failed attempts (slows down guessing). */
export const failDelay = () => new Promise((r) => setTimeout(r, 600));

/**
 * Tiny in-memory fixed-window rate limiter (per process). Returns false when
 * `key` has used up `max` attempts in the current `windowMs`.
 */
const LIMITS = Symbol.for("aion2-gc.rate-limits");
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const g = globalThis as unknown as Record<symbol, Map<string, { n: number; reset: number }> | undefined>;
  const map = (g[LIMITS] ??= new Map());
  const now = Date.now();
  const e = map.get(key);
  if (!e || e.reset <= now) {
    map.set(key, { n: 1, reset: now + windowMs });
    if (map.size > 5000) for (const [k, v] of map) if (v.reset <= now) map.delete(k);
    return true;
  }
  e.n++;
  return e.n <= max;
}

export function clientIp(request: Request): string {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "local").trim();
}
