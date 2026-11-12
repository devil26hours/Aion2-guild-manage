import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runCharacterRefresh } from "@/lib/roster/background-refresh";
import { serverWriteProblem } from "@/lib/supabase/admin";

/**
 * POST /api/cron/refresh-characters — the 30-minute background character refresh.
 *
 * Called by the Railway Cron service (scripts/cron/refresh-characters.mjs), never by
 * browsers: it needs `Authorization: Bearer <CRON_SECRET>` (server-only env var,
 * compared in constant time). Without CRON_SECRET configured the route is disabled.
 * One run at a time (database run lock); answers when the run is over:
 *   200 { status: "completed" | "skipped" | "failed", ... counts, durationMs }
 */
// A run is capped at ~8 minutes by the job itself; allow the request to outlive it.
// (No `dynamic` export: removed under cacheComponents, and a POST handler is dynamic anyway.)
export const maxDuration = 900;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const headers = { "cache-control": "no-store" };
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set: the background refresh is disabled.", status: null } }, { status: 503, headers });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron credentials.", status: null } }, { status: 401, headers });
  }
  const problem = serverWriteProblem();
  if (problem) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: problem, status: null } }, { status: 503, headers });

  const manual = new URL(request.url).searchParams.get("trigger") === "manual";
  try {
    const result = await runCharacterRefresh(manual ? "manual" : "cron");
    console.info(`[character-refresh] ${JSON.stringify(result)}`);
    return NextResponse.json(result, { status: 200, headers });
  } catch (e) {
    // Most likely migration 0015 is missing or the database is unreachable.
    const message = e instanceof Error ? e.message : "Background refresh failed to start.";
    console.error(`[character-refresh] ${message}`);
    return NextResponse.json({ error: { code: "REFRESH_FAILED", message, status: null } }, { status: 500, headers });
  }
}
