/**
 * Map a raw `GET /characters/{name}?server=` response to the roster's
 * API-owned fields. Only the documented/observed fields are read:
 *
 *   character_name ← profile.characterName
 *   class_name     ← profile.className
 *   level          ← profile.characterLevel
 *   combat_power   ← profile.combatPower
 *   item_level     ← stat.statList[type === "ItemLevel"].value
 *   server_name    ← profile.serverName
 *   server_id      ← profile.serverId     (number in the API → string here)
 *   character_id   ← profile.characterId
 *   profile_image  ← profile.profileImage
 *
 * Missing or wrongly-typed optional values become `null` — never guessed.
 */

export interface MappedProfile {
  character_id: string;
  server_id: string;
  character_name: string;
  class_name: string | null;
  level: number | null;
  combat_power: number | null;
  item_level: number | null;
  server_name: string | null;
  profile_image: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export type MapResult = { ok: true; value: MappedProfile } | { ok: false; error: string };

export function mapCharacterProfile(raw: unknown): MapResult {
  if (!isObj(raw) || !isObj(raw.profile)) return { ok: false, error: "Response has no `profile` object." };
  const p = raw.profile;

  const character_id = str(p.characterId);
  const character_name = str(p.characterName);
  const server_id =
    typeof p.serverId === "number" && Number.isInteger(p.serverId) ? String(p.serverId) : str(p.serverId);
  if (!character_id || !character_name || !server_id) {
    return { ok: false, error: "Profile is missing characterId, characterName or serverId." };
  }

  let item_level: number | null = null;
  const statList = isObj(raw.stat) ? raw.stat.statList : undefined;
  if (Array.isArray(statList)) {
    const entry = statList.find((s) => isObj(s) && s.type === "ItemLevel");
    if (isObj(entry)) item_level = num(entry.value);
  }

  return {
    ok: true,
    value: {
      character_id,
      server_id,
      character_name,
      class_name: str(p.className),
      level: num(p.characterLevel),
      combat_power: num(p.combatPower),
      item_level,
      server_name: str(p.serverName),
      profile_image: str(p.profileImage),
    },
  };
}
