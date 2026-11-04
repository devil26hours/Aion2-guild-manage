/**
 * SERVER-ONLY mapping of Supabase / Postgres errors to the app's error shape
 * ({ error: { code, message, status } }). RPCs raise messages prefixed with
 * an app code ("MEMBER_CAP: The guild is full …") — those codes are reused so
 * the client keeps its localized `error:CODE` messages.
 */

if (typeof window !== "undefined") {
  throw new Error("supabase/errors is server-only.");
}

export class DbError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DbError";
  }
}

/** RPC code → [app code, HTTP status]. */
const KNOWN: Record<string, [string, number]> = {
  UNAUTHENTICATED: ["UNAUTHENTICATED", 401],
  LEADER_ONLY: ["LEADER_ONLY", 403],
  DUPLICATE: ["DUPLICATE", 409],
  CHARACTER_IN_GUILD: ["CHARACTER_IN_GUILD", 409],
  OWNER_IN_OTHER_GUILD: ["OWNER_IN_OTHER_GUILD", 409],
  MEMBER_CAP: ["ROSTER_FULL", 409],
  LEADER_SELF: ["CANNOT_REMOVE_LEADER", 409],
  ALREADY_IN_GUILD: ["ALREADY_IN_GUILD", 409],
  CHARACTER_TAKEN: ["CHARACTER_TAKEN", 409],
  ALREADY_HAS_CHARACTER: ["ALREADY_HAS_CHARACTER", 409],
  CHARACTER_NOT_FOUND: ["CHARACTER_NOT_FOUND", 404],
  INVALID_JOIN_CODE: ["INVALID_CODE", 400],
  INVALID_BODY: ["INVALID_BODY", 400],
  INVALID_OP: ["INVALID_OP", 400],
};

interface PgLikeError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/** Convert a PostgREST/RPC error into a DbError (never includes credentials or SQL). */
export function toDbError(e: PgLikeError | null | undefined, fallback = "Database request failed."): DbError {
  const message = e?.message ?? fallback;
  const m = /^([A-Z][A-Z_]+):\s*([\s\S]*)$/.exec(message);
  if (m && KNOWN[m[1]]) {
    const [code, status] = KNOWN[m[1]];
    return new DbError(m[2] || message, code, status);
  }
  if (message === "UNAUTHENTICATED") return new DbError("Sign in required.", "UNAUTHENTICATED", 401);
  switch (e?.code) {
    case "23505":
      return new DbError("This record already exists.", "CONFLICT", 409);
    case "23503":
      return new DbError("A referenced record no longer exists.", "CONFLICT", 409);
    case "23514":
    case "22023":
    case "22P02":
      return new DbError("The data was rejected by a database rule.", "INVALID_DATA", 400);
    case "42501":
      return new DbError("You do not have permission to do this.", "FORBIDDEN", 403);
    case "P0001":
      return new DbError(message, "DB_RULE", 409);
    case "42703":
    case "PGRST202":
    case "PGRST204":
    case "PGRST205":
      return new DbError("The database schema is missing a required function or table. Run all SQL migrations.", "SCHEMA_MISSING", 500);
    default:
      return new DbError(fallback, "DB_ERROR", 500);
  }
}

/** Throw on error, otherwise return the data. */
export function must<T>(res: { data: T; error: PgLikeError | null }, fallback?: string): T {
  if (res.error) throw toDbError(res.error, fallback);
  return res.data;
}
