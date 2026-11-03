/**
 * Guild settings model + validation, shared by the server (authoritative,
 * persisted in Supabase: guilds + guild_settings) and the client (display).
 * Contains no secrets.
 */

export type PartyView = "cards" | "list";

export const SORT_PREF_OPTIONS = [
  "combat_power:desc",
  "combat_power:asc",
  "item_level:desc",
  "item_level:asc",
  "level:desc",
  "level:asc",
] as const;
export type SortPref = (typeof SORT_PREF_OPTIONS)[number];

export const MEMBER_CAP_MIN = 1;
export const MEMBER_CAP_MAX = 999;
export const RECENT_UPDATE_COUNTS = [5, 8, 10] as const;

export const GUILD_IMAGE_TYPES = ["image/png", "image/jpeg"] as const;
export type GuildImageType = (typeof GUILD_IMAGE_TYPES)[number];
/** Server-generated file names only (no user input reaches the path). */
export const GUILD_IMAGE_FILE_RE = /^guild-[0-9a-z]{6,20}-[0-9a-f]{16}\.(png|jpg)$/;
export const GUILD_IMAGE_MAX_BYTES = 1024 * 1024; // 1 MB

/** Reference to the uploaded guild image (never the image data itself). */
export interface GuildImageRef {
  file: string;
  content_type: GuildImageType;
  size: number;
  uploaded_at: string;
}

export interface GuildSettings {
  name: string;
  /** Free text (e.g. a server name from the AION2 API); "" when not set. */
  server: string;
  description: string;
  leader: string;
  /** Maximum number of guild members (enforced when adding members). */
  memberCap: number;
  image: GuildImageRef | null;
}

export interface AdminSettings {
  displayName: string;
  email: string;
  title: string;
  bio: string;
}

export interface DashboardPrefs {
  showTopMembers: boolean;
  showClassDistribution: boolean;
  showRecentUpdates: boolean;
  showQuickActions: boolean;
  recentUpdatesCount: (typeof RECENT_UPDATE_COUNTS)[number];
}

export interface AppPrefs {
  defaultSort: SortPref;
  partyView: PartyView;
  dashboard: DashboardPrefs;
}

export interface Settings {
  guild: GuildSettings;
  admin: AdminSettings;
  prefs: AppPrefs;
}

export interface SettingsFile extends Settings {
  version: 1;
  updated_at: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  guild: { name: "My Guild", server: "", description: "", leader: "", memberCap: 60, image: null },
  admin: { displayName: "Guild Admin", email: "admin@guild.local", title: "Guild Leader", bio: "" },
  prefs: {
    defaultSort: "combat_power:desc",
    partyView: "cards",
    dashboard: {
      showTopMembers: true,
      showClassDistribution: true,
      showRecentUpdates: true,
      showQuickActions: true,
      recentUpdatesCount: 8,
    },
  },
};

export const LIMITS = {
  guildName: { min: 2, max: 40 },
  server: 40,
  description: 300,
  leader: 24,
  displayName: 24,
  email: 120,
  title: 40,
  bio: 300,
} as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
const oneOf = <T,>(v: unknown, opts: readonly T[]): v is T => opts.includes(v as T);

export function isGuildImageRef(v: unknown): v is GuildImageRef {
  return (
    isObj(v) &&
    typeof v.file === "string" &&
    GUILD_IMAGE_FILE_RE.test(v.file) &&
    oneOf(v.content_type, GUILD_IMAGE_TYPES) &&
    typeof v.size === "number" &&
    Number.isInteger(v.size) &&
    v.size > 0 &&
    v.size <= GUILD_IMAGE_MAX_BYTES &&
    typeof v.uploaded_at === "string"
  );
}

const isCap = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= MEMBER_CAP_MIN && v <= MEMBER_CAP_MAX;

export function isSettingsFile(v: unknown): v is SettingsFile {
  if (!isObj(v) || v.version !== 1 || !(v.updated_at === null || typeof v.updated_at === "string")) return false;
  const g = v.guild, a = v.admin, p = v.prefs;
  if (!isObj(g) || !isObj(a) || !isObj(p) || !isObj(p.dashboard)) return false;
  const d = p.dashboard;
  return (
    str(g.name, LIMITS.guildName.max) &&
    (g.name as string).trim().length >= LIMITS.guildName.min &&
    str(g.server, LIMITS.server) &&
    str(g.description, LIMITS.description) &&
    str(g.leader, LIMITS.leader) &&
    isCap(g.memberCap) &&
    (g.image === null || isGuildImageRef(g.image)) &&
    str(a.displayName, LIMITS.displayName) &&
    (a.displayName as string).trim().length > 0 &&
    str(a.email, LIMITS.email) &&
    EMAIL.test(a.email as string) &&
    str(a.title, LIMITS.title) &&
    str(a.bio, LIMITS.bio) &&
    oneOf(p.defaultSort, SORT_PREF_OPTIONS) &&
    oneOf(p.partyView, ["cards", "list"] as const) &&
    typeof d.showTopMembers === "boolean" &&
    typeof d.showClassDistribution === "boolean" &&
    typeof d.showRecentUpdates === "boolean" &&
    typeof d.showQuickActions === "boolean" &&
    oneOf(d.recentUpdatesCount, RECENT_UPDATE_COUNTS)
  );
}

export type SettingsSection = "guild" | "admin" | "prefs";
export type SettingsPatch =
  | { section: "guild"; patch: Partial<Omit<GuildSettings, "image">> }
  | { section: "admin"; patch: Partial<AdminSettings> }
  | { section: "prefs"; patch: Partial<Omit<AppPrefs, "dashboard">> & { dashboard?: Partial<DashboardPrefs> } };

const ALLOWED: Record<SettingsSection, readonly string[]> = {
  guild: ["name", "server", "description", "leader", "memberCap"],
  admin: ["displayName", "email", "title", "bio"],
  prefs: ["defaultSort", "partyView", "dashboard"],
};
const DASH_KEYS = ["showTopMembers", "showClassDistribution", "showRecentUpdates", "showQuickActions", "recentUpdatesCount"];

/**
 * Validate and apply a section patch (server-side authority). Strings are
 * trimmed where a trailing space is never meaningful. Unknown keys are errors.
 */
export function applySettingsPatch(current: Settings, section: unknown, patch: unknown): { ok: true; next: Settings } | { ok: false; error: string } {
  if (!oneOf(section, ["guild", "admin", "prefs"] as const)) return { ok: false, error: "section must be guild, admin or prefs." };
  if (!isObj(patch)) return { ok: false, error: "patch must be an object." };
  const extra = Object.keys(patch).filter((k) => !ALLOWED[section].includes(k));
  if (extra.length) return { ok: false, error: `Unknown ${section} field(s): ${extra.join(", ")}.` };

  if (section === "guild") {
    const g = { ...current.guild };
    if ("name" in patch) {
      if (typeof patch.name !== "string") return { ok: false, error: "Guild name must be text." };
      const n = patch.name.trim();
      if (n.length < LIMITS.guildName.min || n.length > LIMITS.guildName.max) return { ok: false, error: `Guild name must be ${LIMITS.guildName.min}–${LIMITS.guildName.max} characters.` };
      g.name = n;
    }
    if ("server" in patch) {
      if (!str(patch.server, LIMITS.server)) return { ok: false, error: `Server must be at most ${LIMITS.server} characters.` };
      g.server = (patch.server as string).trim();
    }
    if ("description" in patch) {
      if (!str(patch.description, LIMITS.description)) return { ok: false, error: `Description must be at most ${LIMITS.description} characters.` };
      g.description = patch.description as string;
    }
    if ("leader" in patch) {
      if (!str(patch.leader, LIMITS.leader)) return { ok: false, error: `Leader must be at most ${LIMITS.leader} characters.` };
      g.leader = (patch.leader as string).trim();
    }
    if ("memberCap" in patch) {
      if (!isCap(patch.memberCap)) return { ok: false, error: `Maximum members must be a whole number from ${MEMBER_CAP_MIN} to ${MEMBER_CAP_MAX}.` };
      g.memberCap = patch.memberCap as number;
    }
    return { ok: true, next: { ...current, guild: g } };
  }

  if (section === "admin") {
    const a = { ...current.admin };
    if ("displayName" in patch) {
      if (typeof patch.displayName !== "string" || !patch.displayName.trim() || patch.displayName.trim().length > LIMITS.displayName)
        return { ok: false, error: `Display name is required (max ${LIMITS.displayName}).` };
      a.displayName = patch.displayName.trim();
    }
    if ("email" in patch) {
      if (typeof patch.email !== "string" || patch.email.trim().length > LIMITS.email || !EMAIL.test(patch.email.trim()))
        return { ok: false, error: "Enter a valid email address." };
      a.email = patch.email.trim();
    }
    if ("title" in patch) {
      if (!str(patch.title, LIMITS.title)) return { ok: false, error: `Title must be at most ${LIMITS.title} characters.` };
      a.title = (patch.title as string).trim();
    }
    if ("bio" in patch) {
      if (!str(patch.bio, LIMITS.bio)) return { ok: false, error: `Bio must be at most ${LIMITS.bio} characters.` };
      a.bio = patch.bio as string;
    }
    return { ok: true, next: { ...current, admin: a } };
  }

  const p = { ...current.prefs, dashboard: { ...current.prefs.dashboard } };
  if ("defaultSort" in patch) {
    if (!oneOf(patch.defaultSort, SORT_PREF_OPTIONS)) return { ok: false, error: "Invalid default sort." };
    p.defaultSort = patch.defaultSort;
  }
  if ("partyView" in patch) {
    if (!oneOf(patch.partyView, ["cards", "list"] as const)) return { ok: false, error: "Invalid party view." };
    p.partyView = patch.partyView;
  }
  if ("dashboard" in patch) {
    const d = patch.dashboard;
    if (!isObj(d)) return { ok: false, error: "dashboard must be an object." };
    const bad = Object.keys(d).filter((k) => !DASH_KEYS.includes(k));
    if (bad.length) return { ok: false, error: `Unknown dashboard field(s): ${bad.join(", ")}.` };
    for (const k of ["showTopMembers", "showClassDistribution", "showRecentUpdates", "showQuickActions"] as const) {
      if (k in d) {
        if (typeof d[k] !== "boolean") return { ok: false, error: `${k} must be true or false.` };
        p.dashboard[k] = d[k];
      }
    }
    if ("recentUpdatesCount" in d) {
      if (!oneOf(d.recentUpdatesCount, RECENT_UPDATE_COUNTS)) return { ok: false, error: "recentUpdatesCount must be 5, 8 or 10." };
      p.dashboard.recentUpdatesCount = d.recentUpdatesCount;
    }
  }
  return { ok: true, next: { ...current, prefs: p } };
}

export function parseSortPref(v: SortPref): { sortKey: "combat_power" | "item_level" | "level"; sortDir: "asc" | "desc" } {
  const [sortKey, sortDir] = v.split(":") as ["combat_power" | "item_level" | "level", "asc" | "desc"];
  return { sortKey, sortDir };
}
