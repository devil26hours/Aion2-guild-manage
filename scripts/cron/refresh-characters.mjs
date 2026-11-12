#!/usr/bin/env node
// Railway Cron entry point for the background character refresh (every 30 minutes).
//
// Starts one refresh run on the web service and exits when it is over:
//   exit 0 → the run completed, or was skipped because another run is still active;
//   exit 1 → misconfiguration, unreachable service, or a failed run.
// No dependencies (Node 18+: global fetch). Never logs the secret.
//
// Environment (Railway → cron service → Variables):
//   CRON_TARGET_URL  base URL of the web service, preferably its private address,
//                    e.g. http://web.railway.internal:8080  (no trailing path)
//   CRON_SECRET      same value as the web service's CRON_SECRET
//   CRON_TIMEOUT_MS  optional, default 840000 (14 min)

const target = process.env.CRON_TARGET_URL?.trim();
const secret = process.env.CRON_SECRET?.trim();
const timeoutMs = Number(process.env.CRON_TIMEOUT_MS) || 14 * 60_000;

if (!target || !secret) {
  console.error("[refresh-characters] CRON_TARGET_URL and CRON_SECRET must be set.");
  process.exit(1);
}

const url = new URL("/api/cron/refresh-characters", target);
const started = Date.now();
try {
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.json().catch(() => null);
  const took = Math.round((Date.now() - started) / 1000);
  console.log(`[refresh-characters] HTTP ${res.status} after ${took}s: ${JSON.stringify(body)}`);
  if (!res.ok || !body || (body.status !== "completed" && body.status !== "skipped")) process.exit(1);
  process.exit(0);
} catch (e) {
  console.error(`[refresh-characters] request failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
