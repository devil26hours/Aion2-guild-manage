/** SERVER-ONLY: build a roster record from a verified API profile response (no client-sent stats). */

import type { Region } from "@/lib/aion2-api/endpoints";
import type { PartyRole } from "@/lib/party/types";
import type { MappedProfile } from "./mapping";
import { snapshotFromRaw } from "./profile-view";
import { rosterId, type StoredMember } from "./types";

if (typeof window !== "undefined") {
  throw new Error("roster/build-member is server-only.");
}

export function memberFromProfile(
  identity: { region: Region; server_id: string; character_id: string },
  raw: unknown,
  mapped: MappedProfile,
  manual: { role?: PartyRole | null; notes?: string; user_id?: string | null } = {},
): StoredMember {
  const now = new Date().toISOString();
  return {
    id: rosterId(identity.region, identity.server_id, identity.character_id),
    region: identity.region,
    server_id: identity.server_id,
    character_id: identity.character_id,
    character_name: mapped.character_name,
    class_name: mapped.class_name,
    level: mapped.level,
    combat_power: mapped.combat_power,
    item_level: mapped.item_level,
    server_name: mapped.server_name,
    profile_image: mapped.profile_image,
    api_updated_at: now,
    role: manual.role ?? null,
    notes: manual.notes ?? "",
    added_at: now,
    last_refresh_error: null,
    user_id: manual.user_id ?? null,
    api_raw: raw,
    // First real snapshot, captured from this response.
    snapshots: [snapshotFromRaw(raw, now, mapped)],
  };
}
