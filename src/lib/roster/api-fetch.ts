/**
 * SERVER-ONLY: fetch a character profile for the roster using the SAME
 * allowlist/validation (`validateRequest`) and upstream client
 * (`fetchUpstream`) as the API Lab proxy — no second integration.
 */

import { validateRequest } from "@/lib/aion2-api/endpoints";
import { detailString } from "@/lib/aion2-api/types";
import { fetchUpstream, getBaseUrl } from "@/lib/aion2-api/upstream";
import { mapCharacterProfile, type MappedProfile } from "./mapping";

if (typeof window !== "undefined") {
  throw new Error("roster/api-fetch is server-only.");
}

export type ProfileFetch =
  | { ok: true; mapped: MappedProfile; raw: unknown }
  | { ok: false; status: number; message: string; upstreamStatus: number | null };

export async function fetchCharacterProfile(name: string, serverId: string): Promise<ProfileFetch> {
  return fetchValidated(validateRequest("character-profile", { name, server: serverId }));
}

/**
 * Same response handling, but straight by ids (`/characters/by-id`): no upstream name
 * search, and still correct after a rename. Used by the background refresh.
 */
export async function fetchCharacterProfileById(characterId: string, serverId: string, region: string, timeoutMs?: number): Promise<ProfileFetch> {
  return fetchValidated(validateRequest("character-profile-by-id", { characterId, serverId, region }), timeoutMs);
}

async function fetchValidated(check: ReturnType<typeof validateRequest>, timeoutMs?: number): Promise<ProfileFetch> {
  if (!check.ok) {
    return { ok: false, status: 400, upstreamStatus: null, message: check.errors.map((e) => e.message).join(" ") };
  }
  const base = getBaseUrl();
  if (!base) return { ok: false, status: 500, upstreamStatus: null, message: "AION2_API_BASE_URL is not configured." };

  const res = await fetchUpstream(base, check.path, check.query, timeoutMs);
  if (res.kind === "error") {
    return { ok: false, status: res.code === "TIMEOUT" ? 504 : 502, upstreamStatus: null, message: res.message };
  }

  let body: unknown;
  try {
    body = JSON.parse(res.body);
  } catch {
    return { ok: false, status: 502, upstreamStatus: res.status, message: "The AION2 API returned a non-JSON response." };
  }

  if (res.status !== 200) {
    const detail = detailString(body) ?? `HTTP ${res.status}`;
    const lead =
      res.status === 404
        ? "Character not found."
        : res.status === 409
          ? "Several characters share this name on the given server."
          : res.status === 503
            ? "Upstream rate limiting or blocking."
            : res.status === 502
              ? "Upstream API error."
              : `AION2 API returned HTTP ${res.status}.`;
    // Mirror upstream 4xx/5xx so the UI can tell them apart.
    return { ok: false, status: res.status, upstreamStatus: res.status, message: `${lead} ${detail}` };
  }

  const mapped = mapCharacterProfile(body);
  if (!mapped.ok) return { ok: false, status: 502, upstreamStatus: 200, message: mapped.error };
  return { ok: true, mapped: mapped.value, raw: body };
}
