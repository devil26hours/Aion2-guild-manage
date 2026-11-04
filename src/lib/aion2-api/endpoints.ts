/**
 * AION2 API Lab — endpoint allowlist + parameter validation.
 *
 * Shared by the browser form and the server-side proxy. Definitions mirror
 * the local service's OpenAPI spec (http://127.0.0.1:8000/openapi.json,
 * "AION 2 Notices, Events, Servers & Characters" v1.0.0). Only these
 * endpoints can be reached through the proxy.
 */

export const REGIONS = ["nae", "naw", "eu", "la", "as"] as const;
export type Region = (typeof REGIONS)[number];

/**
 * Display names for the region codes. The API and database only carry the
 * codes; these names are the app's own labels (never sent upstream or stored).
 */
export const REGION_LABELS: Record<Region, string> = {
  nae: "North America East",
  naw: "North America West",
  eu: "Europe",
  la: "Latin America",
  as: "Asia",
};

/** Full region name for display; unknown codes fall back to the upper-cased code. */
export function regionLabel(code: string): string {
  return (REGION_LABELS as Record<string, string>)[code] ?? code.toUpperCase();
}

export const ENDPOINT_IDS = [
  "character-search",
  "character-profile",
  "character-equipment-item",
  "character-daevanion",
  "character-daevanion-board",
  "servers-roster",
] as const;
export type EndpointId = (typeof ENDPOINT_IDS)[number];

export interface ParamDef {
  name: string;
  in: "path" | "query";
  required: boolean;
  label: string;
  kind: "text" | "select";
  options?: readonly string[];
  placeholder?: string;
  help?: string;
  /** Query-only "text" params: replaces the default safe-text check (e.g. base64 ids, integers). */
  pattern?: RegExp;
}

export interface EndpointDef {
  id: EndpointId;
  label: string;
  method: "GET";
  /** Upstream path with {placeholders}. */
  path: string;
  summary: string;
  params: ParamDef[];
}

const NAME_PATH: ParamDef = {
  name: "name",
  in: "path",
  required: true,
  label: "Character name",
  kind: "text",
  placeholder: "e.g. Kael",
  help: "Exact character name.",
};
const SERVER_QUERY: ParamDef = {
  name: "server",
  in: "query",
  required: false,
  label: "Server",
  kind: "text",
  placeholder: "e.g. 1501 or Siel",
  help: "Server id or name — needed when the name exists on several servers.",
};

export const ENDPOINTS: Record<EndpointId, EndpointDef> = {
  "character-search": {
    id: "character-search",
    label: "Character Search",
    method: "GET",
    path: "/characters/search",
    summary: "Find characters by name (partial matches), across all Global regions unless a region is given.",
    params: [
      { name: "name", in: "query", required: true, label: "Name", kind: "text", placeholder: "Name or part of one" },
      { name: "region", in: "query", required: false, label: "Region", kind: "select", options: REGIONS, help: "Optional — default searches every region." },
    ],
  },
  "character-profile": {
    id: "character-profile",
    label: "Character Profile",
    method: "GET",
    path: "/characters/{name}",
    summary:
      "Merged info + equipment response, passed through unchanged (profile, stat, title, ranking, daevanion, equipment, petwing, skill). With item_details=true each equipped item also carries itemDetail (slow: one upstream request per item).",
    params: [
      NAME_PATH,
      SERVER_QUERY,
      {
        name: "item_details",
        in: "query",
        required: false,
        label: "Item details",
        kind: "select",
        options: ["false", "true"],
        help: "Optional — true attaches equipment.equipmentList[].itemDetail (one extra upstream request per item; the first load can take ~30 s).",
      },
    ],
  },
  "character-equipment-item": {
    id: "character-equipment-item",
    label: "Equipment Item Detail",
    method: "GET",
    path: "/characters/equipment/item",
    summary:
      "One equipped item's detail (soulBindRate, mainStats, subStats, subSkills, magicStoneStat, godStoneStat), NCSOFT's response passed through unchanged. characterId/serverId come from a Character Profile's profile, the rest from its equipmentList entry.",
    params: [
      { name: "characterId", in: "query", required: true, label: "characterId", kind: "text", placeholder: "profile.characterId", pattern: /^[A-Za-z0-9_\-=+/%]{1,128}$/ },
      { name: "serverId", in: "query", required: true, label: "serverId", kind: "text", placeholder: "e.g. 1501", pattern: /^\d{4}$/ },
      { name: "id", in: "query", required: true, label: "Item id", kind: "text", placeholder: "equipmentList[].id", pattern: /^[1-9]\d{0,11}$/ },
      { name: "slotPos", in: "query", required: true, label: "slotPos", kind: "text", placeholder: "equipmentList[].slotPos", pattern: /^[1-9]\d{0,3}$/ },
      { name: "enchantLevel", in: "query", required: true, label: "enchantLevel", kind: "text", placeholder: "equipmentList[].enchantLevel", pattern: /^\d{1,4}$/ },
      { name: "exceedLevel", in: "query", required: true, label: "exceedLevel", kind: "text", placeholder: "equipmentList[].exceedLevel", pattern: /^\d{1,4}$/ },
      { name: "region", in: "query", required: false, label: "Region", kind: "select", options: REGIONS, help: "Optional — default: the server's own region." },
    ],
  },
  "character-daevanion": {
    id: "character-daevanion",
    label: "Daevanion Boards",
    method: "GET",
    path: "/characters/{name}/daevanion",
    summary: "A character's Daevanion boards (id, name, open/total node counts, open percent).",
    params: [NAME_PATH, SERVER_QUERY],
  },
  "character-daevanion-board": {
    id: "character-daevanion-board",
    label: "Daevanion Board Detail",
    method: "GET",
    path: "/characters/{name}/daevanion/{board}",
    summary: "One Daevanion board, node by node (15×15 nodeList).",
    params: [
      NAME_PATH,
      { name: "board", in: "path", required: true, label: "Board", kind: "text", placeholder: "Board name or id, e.g. Nezekan or 31" },
      SERVER_QUERY,
    ],
  },
  "servers-roster": {
    id: "servers-roster",
    label: "Server Roster",
    method: "GET",
    path: "/servers/roster",
    summary: "Server ids, names, factions and regions from NCSOFT's own list (cached upstream for an hour).",
    params: [],
  },
};

/** `item_details=true` fetches every equipped item one by one upstream (~25 s cold), so it gets a longer timeout. */
export const ITEM_DETAILS_TIMEOUT_MS = 120_000;

/** Upstream timeout for one proxied request; undefined = the default. */
export function upstreamTimeoutFor(id: EndpointId, query: Record<string, string>): number | undefined {
  return id === "character-profile" && query.item_details === "true" ? ITEM_DETAILS_TIMEOUT_MS : undefined;
}

export function isEndpointId(v: string): v is EndpointId {
  return (ENDPOINT_IDS as readonly string[]).includes(v);
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const MAX_LEN = 64;
// Letters (any script), digits, space, apostrophe, dot, hyphen, underscore.
const SAFE_TEXT = /^[\p{L}\p{N} '._-]+$/u;

export interface ParamError {
  param: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; path: string; query: Record<string, string> }
  | { ok: false; errors: ParamError[] };

/**
 * Validate raw string params for an endpoint and build the upstream path +
 * query. Unknown params are rejected so the proxy cannot be used as an open
 * relay. Empty optional params are dropped.
 */
export function validateRequest(id: EndpointId, raw: Record<string, string | undefined>): ValidationResult {
  const def = ENDPOINTS[id];
  const errors: ParamError[] = [];
  const known = new Set(def.params.map((p) => p.name));
  for (const k of Object.keys(raw)) if (!known.has(k)) errors.push({ param: k, message: "Unknown parameter." });

  const values: Record<string, string> = {};
  for (const p of def.params) {
    const v = (raw[p.name] ?? "").trim();
    if (!v) {
      if (p.required) errors.push({ param: p.name, message: `${p.label} is required.` });
      continue;
    }
    if (v.length > MAX_LEN) {
      errors.push({ param: p.name, message: `${p.label} must be at most ${MAX_LEN} characters.` });
      continue;
    }
    if (p.kind === "select") {
      if (!p.options?.includes(v)) errors.push({ param: p.name, message: `${p.label} must be one of: ${p.options?.join(", ")}.` });
    } else if (p.pattern) {
      // Pattern params are query-only, so their values never become a path segment.
      if (p.in !== "query" || !p.pattern.test(v)) errors.push({ param: p.name, message: `${p.label} has an invalid format.` });
    } else if (!SAFE_TEXT.test(v) || v.includes("..")) {
      // ".." is rejected so a path value can never become a dot-segment.
      errors.push({ param: p.name, message: `${p.label} contains unsupported characters.` });
    }
    values[p.name] = v;
  }
  if (errors.length) return { ok: false, errors };

  let path = def.path;
  const query: Record<string, string> = {};
  for (const p of def.params) {
    const v = values[p.name];
    if (v === undefined) continue;
    if (p.in === "path") path = path.replace(`{${p.name}}`, encodeURIComponent(v));
    else query[p.name] = v;
  }
  return { ok: true, path, query };
}

/* ------------------------------------------------------------------ */
/* Status meaning (from the service's app.py error handling)           */
/* ------------------------------------------------------------------ */

export type ResponseSource = "upstream" | "proxy";

export function describeStatus(status: number, source: ResponseSource): { label: string; tone: "ok" | "warn" | "error" } {
  if (source === "proxy") {
    if (status === 400) return { label: "Rejected by proxy — invalid parameters", tone: "error" };
    if (status === 404) return { label: "Unknown endpoint", tone: "error" };
    if (status === 504) return { label: "Timed out waiting for the local API", tone: "error" };
    if (status === 502) return { label: "Local AION2 API unreachable", tone: "error" };
    return { label: "Proxy error", tone: "error" };
  }
  if (status >= 200 && status < 300) return { label: "OK", tone: "ok" };
  switch (status) {
    case 404:
      return { label: "Not found", tone: "warn" };
    case 409:
      return { label: "Multiple characters found — pick a server", tone: "warn" };
    case 422:
      return { label: "Invalid request parameters", tone: "error" };
    case 502:
      return { label: "Upstream API error", tone: "error" };
    case 503:
      return { label: "Upstream rate limiting or blocking", tone: "error" };
    default:
      return { label: `HTTP ${status}`, tone: status >= 400 ? "error" : "warn" };
  }
}
