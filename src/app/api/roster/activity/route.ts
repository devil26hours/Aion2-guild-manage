import { requireGuild } from "@/lib/auth/context";
import { json, storageFailure } from "@/lib/roster/http";
import { guildSnapshots, listMembers } from "@/lib/roster/storage";

/**
 * GET /api/roster/activity?limit=N — most recent stored snapshots across the
 * roster (newest first), each with the change since that member's previous
 * snapshot. Only real stored snapshots are used; nothing is interpolated.
 */
export async function GET(request: Request) {
  const auth = await requireGuild(request);
  if (auth.response) return auth.response;
  const raw = Number(new URL(request.url).searchParams.get("limit") ?? "10");
  const limit = Number.isInteger(raw) ? Math.min(50, Math.max(1, raw)) : 10;
  try {
    const [members, byMember] = await Promise.all([listMembers(auth.supabase, auth.guildId), guildSnapshots(auth.supabase, auth.guildId)]);
    const events = members.flatMap((m) => {
      const snaps = byMember.get(m.db_id) ?? [];
      return snaps.map((s, i) => {
        const prev = i > 0 ? snaps[i - 1] : null;
        const d = (a: number | null, b: number | null | undefined) => (a !== null && b !== null && b !== undefined ? a - b : null);
        return {
          member_id: m.id,
          character_name: m.character_name,
          class_name: m.class_name,
          captured_at: s.captured_at,
          combat_power: s.combat_power,
          item_level: s.item_level,
          level: s.level,
          first: prev === null,
          delta_cp: prev ? d(s.combat_power, prev.combat_power) : null,
          delta_il: prev ? d(s.item_level, prev.item_level) : null,
        };
      });
    });
    events.sort((a, b) => b.captured_at.localeCompare(a.captured_at));
    const total = events.length;
    return json({ events: events.slice(0, limit), total });
  } catch (e) {
    return storageFailure(e);
  }
}
