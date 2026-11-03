import { requireGuild } from "@/lib/auth/context";
import { readPartyFile } from "@/lib/party/storage";
import { json, storageFailure } from "@/lib/roster/http";
import { listMembers } from "@/lib/roster/storage";
import { readSettingsFile } from "@/lib/settings/storage";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { toDbError } from "@/lib/supabase/errors";

interface OverviewRow {
  roster_members: number;
  linked_accounts: number;
  snapshots: number;
  party_presets: number;
}

/**
 * GET /api/data/overview — what the caller's guild stores (any guild member,
 * read-only). Every number comes from a database query made as the caller
 * (RLS applied). No URLs, keys or other guilds' data are returned.
 */
export async function GET(request: Request) {
  const auth = await requireGuild(request);
  if (auth.response) return auth.response;
  const { guildId, supabase } = auth;
  try {
    const [overview, members, settings, parties] = await Promise.all([
      supabase.rpc("guild_data_overview").maybeSingle(),
      listMembers(supabase, guildId),
      readSettingsFile(supabase, guildId),
      readPartyFile(supabase, guildId),
    ]);
    if (overview.error) throw toDbError(overview.error);
    const o = overview.data as OverviewRow | null;
    return json({
      storage: {
        provider: "supabase" as const,
        // This response itself proves the database answered for this guild.
        database: "connected" as const,
        server_access: isSupabaseAdminConfigured(),
      },
      counts: {
        accounts: Number(o?.linked_accounts ?? 0),
        roster_members: Number(o?.roster_members ?? members.length),
        registered_characters: members.filter((m) => m.user_id).length,
        snapshots: Number(o?.snapshots ?? 0),
        // Stored presets only (a guild that never edited presets shows defaults that are not stored yet).
        party_presets: Number(o?.party_presets ?? 0),
      },
      image: settings.guild.image ? { size: settings.guild.image.size, content_type: settings.guild.image.content_type, uploaded_at: settings.guild.image.uploaded_at } : null,
      updated: {
        settings: settings.updated_at,
        parties: Number(o?.party_presets ?? 0) ? parties.updated_at : null,
        roster: members.reduce<string | null>((t, m) => (!t || m.api_updated_at > t ? m.api_updated_at : t), null),
      },
    });
  } catch (e) {
    return storageFailure(e);
  }
}
