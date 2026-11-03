/**
 * SERVER-ONLY persistence for one guild's settings in Supabase:
 *   guild section  → public.guilds        (name, server, description, leader_label, member_cap, image_*)
 *   admin / prefs  → public.guild_settings
 * Uploaded guild images live in the private Storage bucket "guild-images" at
 * "<guild uuid>/<server-generated file>"; the row only stores a reference.
 * All calls use the caller's RLS-bound client (Guild Leader for writes).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DbError, must } from "@/lib/supabase/errors";
import {
  DEFAULT_SETTINGS,
  GUILD_IMAGE_FILE_RE,
  type AdminSettings,
  type AppPrefs,
  type GuildImageRef,
  type GuildImageType,
  type GuildSettings,
  type Settings,
  type SettingsFile,
  type SortPref,
} from "./schema";

if (typeof window !== "undefined") {
  throw new Error("settings/storage is server-only.");
}

export const GUILD_IMAGE_BUCKET = "guild-images";

const GUILD_COLS = "name, server, description, leader_label, member_cap, image_path, image_content_type, image_size, image_uploaded_at, updated_at";
const SETTINGS_COLS =
  "admin_display_name, admin_email, admin_title, admin_bio, default_sort, party_view, show_top_members, show_class_distribution, show_recent_updates, show_quick_actions, recent_updates_count, updated_at";

interface GuildRow {
  name: string;
  server: string;
  description: string;
  leader_label: string;
  member_cap: number;
  image_path: string | null;
  image_content_type: GuildImageType | null;
  image_size: number | null;
  image_uploaded_at: string | null;
  updated_at: string;
}
interface SettingsRow {
  admin_display_name: string;
  admin_email: string;
  admin_title: string;
  admin_bio: string;
  default_sort: SortPref;
  party_view: "cards" | "list";
  show_top_members: boolean;
  show_class_distribution: boolean;
  show_recent_updates: boolean;
  show_quick_actions: boolean;
  recent_updates_count: 5 | 8 | 10;
  updated_at: string;
}

/** Object path inside the bucket for a generated file name (null if the name is not one we generate). */
export function guildImageObjectPath(guildId: string, file: string): string | null {
  return GUILD_IMAGE_FILE_RE.test(file) ? `${guildId}/${file}` : null;
}

function imageRef(g: GuildRow): GuildImageRef | null {
  if (!g.image_path || !g.image_content_type || !g.image_size || !g.image_uploaded_at) return null;
  const file = g.image_path.split("/")[1] ?? "";
  return GUILD_IMAGE_FILE_RE.test(file) ? { file, content_type: g.image_content_type, size: g.image_size, uploaded_at: g.image_uploaded_at } : null;
}

export async function readSettingsFile(sb: SupabaseClient, guildId: string): Promise<SettingsFile & { image_path: string | null }> {
  const [g, s] = await Promise.all([
    sb.from("guilds").select(GUILD_COLS).eq("id", guildId).maybeSingle(),
    sb.from("guild_settings").select(SETTINGS_COLS).eq("guild_id", guildId).maybeSingle(),
  ]);
  const guild = must(g) as GuildRow | null;
  const st = must(s) as SettingsRow | null;
  if (!guild) throw new DbError("Guild not found.", "GUILD_NOT_FOUND", 404);
  const d = DEFAULT_SETTINGS;
  const updated = [guild.updated_at, st?.updated_at].filter((x): x is string => !!x).sort().at(-1) ?? null;
  return {
    version: 1,
    updated_at: updated,
    image_path: guild.image_path,
    guild: {
      name: guild.name,
      server: guild.server,
      description: guild.description,
      leader: guild.leader_label,
      memberCap: guild.member_cap,
      image: imageRef(guild),
    },
    admin: st
      ? { displayName: st.admin_display_name, email: st.admin_email, title: st.admin_title, bio: st.admin_bio }
      : { ...d.admin },
    prefs: st
      ? {
          defaultSort: st.default_sort,
          partyView: st.party_view,
          dashboard: {
            showTopMembers: st.show_top_members,
            showClassDistribution: st.show_class_distribution,
            showRecentUpdates: st.show_recent_updates,
            showQuickActions: st.show_quick_actions,
            recentUpdatesCount: st.recent_updates_count,
          },
        }
      : structuredClone(d.prefs),
  };
}

export function toSettings(f: SettingsFile): Settings {
  return { guild: f.guild, admin: f.admin, prefs: f.prefs };
}

/** RLS turns a forbidden UPDATE into "0 rows" — treat that as a permission error. */
function oneRow(rows: unknown[] | null) {
  if (!rows || rows.length !== 1) throw new DbError("Only the Guild Leader can change this guild.", "LEADER_ONLY", 403);
}

export async function writeGuildSection(sb: SupabaseClient, guildId: string, g: Omit<GuildSettings, "image">): Promise<void> {
  oneRow(
    must(
      await sb
        .from("guilds")
        .update({ name: g.name, server: g.server, description: g.description, leader_label: g.leader, member_cap: g.memberCap })
        .eq("id", guildId)
        .select("id"),
    ),
  );
}

export async function writeAdminSection(sb: SupabaseClient, guildId: string, a: AdminSettings): Promise<void> {
  oneRow(
    must(
      await sb
        .from("guild_settings")
        .update({ admin_display_name: a.displayName, admin_email: a.email, admin_title: a.title, admin_bio: a.bio })
        .eq("guild_id", guildId)
        .select("guild_id"),
    ),
  );
}

export async function writePrefsSection(sb: SupabaseClient, guildId: string, p: AppPrefs): Promise<void> {
  oneRow(
    must(
      await sb
        .from("guild_settings")
        .update({
          default_sort: p.defaultSort,
          party_view: p.partyView,
          show_top_members: p.dashboard.showTopMembers,
          show_class_distribution: p.dashboard.showClassDistribution,
          show_recent_updates: p.dashboard.showRecentUpdates,
          show_quick_actions: p.dashboard.showQuickActions,
          recent_updates_count: p.dashboard.recentUpdatesCount,
        })
        .eq("guild_id", guildId)
        .select("guild_id"),
    ),
  );
}

/** Set (or clear) the image reference on the guild row. */
export async function writeGuildImage(sb: SupabaseClient, guildId: string, ref: GuildImageRef | null): Promise<void> {
  const path = ref ? guildImageObjectPath(guildId, ref.file) : null;
  if (ref && !path) throw new DbError("Invalid image file name.", "INTERNAL", 500);
  oneRow(
    must(
      await sb
        .from("guilds")
        .update({
          image_path: path,
          image_content_type: ref?.content_type ?? null,
          image_size: ref?.size ?? null,
          image_uploaded_at: ref?.uploaded_at ?? null,
        })
        .eq("id", guildId)
        .select("id"),
    ),
  );
}

/** Best-effort removal of a stored image object (the reference is already gone). */
export async function removeGuildImageObject(sb: SupabaseClient, guildId: string, file: string | null | undefined): Promise<void> {
  const path = file ? guildImageObjectPath(guildId, file) : null;
  if (path) await sb.storage.from(GUILD_IMAGE_BUCKET).remove([path]).catch(() => undefined);
}

/** Restore default settings (guild info, admin profile, preferences, no image). */
export async function resetSettings(sb: SupabaseClient, guildId: string): Promise<void> {
  const d = DEFAULT_SETTINGS;
  await writeGuildSection(sb, guildId, d.guild);
  await writeGuildImage(sb, guildId, null);
  await writeAdminSection(sb, guildId, d.admin);
  await writePrefsSection(sb, guildId, d.prefs);
}
