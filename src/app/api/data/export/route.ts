import { NextResponse } from "next/server";
import { requireGuild } from "@/lib/auth/context";
import { isDeveloper } from "@/lib/auth/developer";
import { readPartyFile } from "@/lib/party/storage";
import { storageFailure } from "@/lib/roster/http";
import { guildSnapshots, listMembers, toPublicMember } from "@/lib/roster/storage";
import { readSettingsFile, toSettings } from "@/lib/settings/storage";
import { toDbError } from "@/lib/supabase/errors";

/**
 * GET /api/data/export (Guild Leader only) — download a JSON export of the
 * caller's guild, read from Supabase as the leader (RLS applied):
 * guild info, settings, member accounts (id + role only), roster with each
 * character's stored API response, snapshot history with equipment, and
 * party presets with their slots.
 *
 * Read-only. Never included: passwords or hashes, emails, sessions or tokens,
 * the join code or its hash, keys, other guilds' data, or the image binary.
 * This is a guild-level export — NOT a full database backup.
 */
export async function GET(request: Request) {
  const auth = await requireGuild(request, { leader: true });
  if (auth.response) return auth.response;
  const { guildId, guild, supabase } = auth;
  try {
    // Raw AION 2 API responses are developer data: they are in the export only for DEV accounts.
    const dev = await isDeveloper(supabase);
    const [members, snapshots, parties, settings, memberships, code] = await Promise.all([
      listMembers(supabase, guildId, { raw: dev }),
      guildSnapshots(supabase, guildId, { equipment: true }),
      readPartyFile(supabase, guildId),
      readSettingsFile(supabase, guildId),
      supabase.from("guild_memberships").select("user_id, role, joined_at").eq("guild_id", guildId).order("joined_at"),
      supabase.rpc("guild_join_code_set"),
    ]);
    if (memberships.error) throw toDbError(memberships.error);
    const ownedBy = new Map(members.flatMap((m) => (m.user_id ? [[m.user_id, m.id] as const] : [])));
    const exportedAt = new Date().toISOString();
    const body = {
      format: "aion2-guild-command-export",
      format_version: 2,
      storage: "supabase",
      scope: "guild",
      exported_at: exportedAt,
      guild: { id: guild.id, name: guild.name, created_at: guild.created_at, leader_user_id: guild.leader_user_id, join_code_set: code.data === true },
      accounts: (memberships.data ?? []).map((m) => ({ id: m.user_id as string, role: m.role as string, joined_at: m.joined_at as string, character_id: ownedBy.get(m.user_id as string) ?? null })),
      settings: toSettings(settings),
      roster: {
        version: 1,
        members: members.map((m) => ({ ...toPublicMember(m), ...(dev ? { api_raw: m.api_raw ?? null } : {}), snapshots: snapshots.get(m.db_id) ?? [] })),
      },
      party_presets: parties,
    };
    const stamp = exportedAt.slice(0, 19).replace(/[:T]/g, "-");
    return new NextResponse(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="guild-${guildId}-${stamp}.json"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    return storageFailure(e);
  }
}
