/**
 * Types for the parts of the AION2 API responses the Lab UI reads directly.
 * Taken from the service's OpenAPI components (CharacterHit,
 * ServerRosterEntry, HTTPValidationError) and its documented error bodies.
 * Character profile / Daevanion payloads are NOT typed here on purpose: they
 * are shown as raw JSON, unmodified.
 */

/** `CharacterHit` — /characters/search items and 409 `candidates`. */
export interface CharacterHit {
  character_id: string;
  name: string;
  level: number | null;
  server_id: string;
  server_name: string | null;
  region: string;
}

/** `ServerRosterEntry` — /servers/roster items. */
export interface ServerRosterEntry {
  server_id: string;
  name: string | null;
  short_name: string | null;
  faction: string | null;
  region: string;
}

/** `ValidationError` — items of a 422 `detail` array. */
export interface ValidationErrorItem {
  loc: (string | number)[];
  msg: string;
  type: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
}

/** 409 body: `{ detail, candidates }`. */
export interface AmbiguousNameBody {
  detail: string;
  candidates: CharacterHit[];
}

/** Error envelope produced by the Next.js proxy itself (never by upstream). */
export interface ProxyErrorBody {
  proxy_error: {
    code: "INVALID_PARAMS" | "UNKNOWN_ENDPOINT" | "NOT_CONFIGURED" | "UNREACHABLE" | "TIMEOUT" | "TOO_LARGE";
    message: string;
    errors?: { param: string; message: string }[];
  };
}

/* ---------- narrow, defensive guards (no field invention) ---------- */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function isCharacterHit(v: unknown): v is CharacterHit {
  return isObj(v) && typeof v.character_id === "string" && typeof v.name === "string" && typeof v.server_id === "string" && typeof v.region === "string";
}

export function isCharacterHitList(v: unknown): v is CharacterHit[] {
  return Array.isArray(v) && v.every(isCharacterHit);
}

export function isServerRosterList(v: unknown): v is ServerRosterEntry[] {
  return Array.isArray(v) && v.every((e) => isObj(e) && typeof e.server_id === "string" && typeof e.region === "string" && (e.name === null || typeof e.name === "string"));
}

export function isAmbiguousNameBody(v: unknown): v is AmbiguousNameBody {
  return isObj(v) && typeof v.detail === "string" && isCharacterHitList(v.candidates);
}

export function isValidationErrorBody(v: unknown): v is { detail: ValidationErrorItem[] } {
  return isObj(v) && Array.isArray(v.detail) && v.detail.every((d) => isObj(d) && Array.isArray(d.loc) && typeof d.msg === "string");
}

export function isProxyErrorBody(v: unknown): v is ProxyErrorBody {
  return isObj(v) && isObj(v.proxy_error) && typeof v.proxy_error.message === "string";
}

export function detailString(v: unknown): string | null {
  return isObj(v) && typeof v.detail === "string" ? v.detail : null;
}
