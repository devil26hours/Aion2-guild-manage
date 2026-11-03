/** SERVER-ONLY helpers shared by the roster Route Handlers. */

import { NextResponse } from "next/server";
import { SupabaseAdminNotConfiguredError } from "@/lib/supabase/admin";
import { DbError, toDbError } from "@/lib/supabase/errors";
import { SupabaseNotConfiguredError } from "@/lib/supabase/server";
import { ROSTER_ID_RE } from "./types";

if (typeof window !== "undefined") {
  throw new Error("roster/http is server-only.");
}

export interface RosterErrorBody {
  error: { code: string; message: string; status?: number | null };
}

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

export function fail(status: number, code: string, message: string, upstreamStatus?: number | null) {
  return json({ error: { code, message, status: upstreamStatus ?? null } } satisfies RosterErrorBody, status);
}

/** Database / configuration failure → error response (no SQL, URLs or keys are sent). */
export function storageFailure(e: unknown) {
  if (e instanceof DbError) return fail(e.status, e.code, e.message);
  if (e instanceof SupabaseNotConfiguredError || e instanceof SupabaseAdminNotConfiguredError) {
    console.error("[supabase]", e.message);
    return fail(503, "NOT_CONFIGURED", "The server is not fully configured for database access.");
  }
  if (e && typeof e === "object" && "message" in e && ("code" in e || "details" in e)) {
    const err = toDbError(e as { message?: string; code?: string });
    return fail(err.status, err.code, err.message);
  }
  console.error("[storage]", e);
  return fail(500, "INTERNAL", "Unexpected server error.");
}

/** Parse a small JSON body (default ≤ 8 KB) into an object, or return null. */
export async function readJsonBody(request: Request, maxBytes = 8192): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try {
    const v: unknown = JSON.parse(text);
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Route params arrive decoded; accept only well-formed roster ids. */
export function parseMemberId(raw: string): string | null {
  let id = raw;
  try {
    if (/%[0-9A-Fa-f]{2}/.test(id)) id = decodeURIComponent(id);
  } catch {
    return null;
  }
  return ROSTER_ID_RE.test(id) ? id : null;
}
