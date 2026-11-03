import { AION_CLASSES, CLASS_META, type AionClass } from "@/lib/aion/classes";
import type { PartyMember, PartyRole } from "@/lib/party/types";
import type { RosterMember } from "./types";

/** Roster member → the narrow view the Party Builder uses. */
export function toPartyMember(m: RosterMember): PartyMember {
  return {
    id: m.id,
    character_name: m.character_name,
    class_name: m.class_name,
    level: m.level,
    combat_power: m.combat_power,
    item_level: m.item_level,
    server_name: m.server_name,
    role: m.role,
    comment: m.notes,
  };
}

/** The app's class metadata (color/icon) when the API class name matches it exactly. */
export function knownClass(name: string | null): AionClass | null {
  return name && (AION_CLASSES as readonly string[]).includes(name) ? (name as AionClass) : null;
}

/**
 * Role to pre-fill when placing a member in a party slot: the member's
 * manually assigned guild role, else the app's class archetype (planning
 * hint only), else none.
 */
export function suggestedRole(m: Pick<PartyMember, "role" | "class_name">): PartyRole | null {
  if (m.role) return m.role;
  const cls = knownClass(m.class_name);
  if (!cls) return null;
  const r = CLASS_META[cls].role;
  return r === "Tank" || r === "Healer" || r === "Support" ? r : "DPS";
}
