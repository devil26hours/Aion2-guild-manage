/**
 * SERVER-ONLY request context: who is calling, which guild they belong to,
 * and whether they are its leader. Every Route Handler resolves this itself
 * (the proxy is only the first line of defense).
 *
 * Identity comes from the verified Supabase Auth JWT (getClaims); membership
 * and ownership are read through the user's own RLS-bound client, so the
 * database applies the same rules again.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { CharacterRef } from "@/lib/accounts/users";
import type { Region } from "@/lib/aion2-api/endpoints";
import { toDbError } from "@/lib/supabase/errors";
import { createSupabaseServerClient, SupabaseNotConfiguredError } from "@/lib/supabase/server";
import { unauthorized } from "./require-session";

if (typeof window !== "undefined") {
  throw new Error("auth/context is server-only.");
}

/** The account's own character, with its database row id. */
export interface OwnedCharacter extends CharacterRef {
  db_id: string;
  /** From the stored AION2 API data (characters.profile_image); null until the character has been fetched/refreshed. */
  profile_image: string | null;
}

export interface SessionUser {
  id: string;
  email: string;
  character: OwnedCharacter | null;
  guild_id: string | null;
  role: "leader" | "member" | null;
  /** A DEV suspended this account (public.user_suspensions). */
  suspended: boolean;
}

export interface AuthContext {
  user: SessionUser;
  /** RLS-bound client acting as this user. */
  supabase: SupabaseClient;
}
export interface GuildRecord {
  id: string;
  name: string;
  leader_user_id: string | null;
  created_at: string;
}
export interface GuildContext extends AuthContext {
  guildId: string;
  guild: GuildRecord;
  isLeader: boolean;
}

const denied = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message, status: null } }, { status, headers: { "cache-control": "no-store" } });

const SCHEMA_MISSING = new Set(["PGRST205", "42P01"]);

interface OwnershipRow {
  character_id: string;
  characters: { region: Region; server_id: string; character_id: string; character_name: string; profile_image: string | null } | null;
}

/** Verified user → account context, or null when signed out. Throws on database errors. */
export async function loadSessionUser(supabase: SupabaseClient): Promise<SessionUser | null> {
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims || typeof claims.sub !== "string") return null;
  const uid = claims.sub;
  const [membership, ownership, suspension] = await Promise.all([
    supabase.from("guild_memberships").select("guild_id, role").eq("user_id", uid).maybeSingle(),
    supabase.from("character_ownerships").select("character_id, characters(region, server_id, character_id, character_name, profile_image)").eq("user_id", uid).maybeSingle(),
    supabase.from("user_suspensions").select("user_id").eq("user_id", uid).maybeSingle(),
  ]);
  if (membership.error) throw toDbError(membership.error);
  if (ownership.error) throw toDbError(ownership.error);
  // A missing table (migration 0009 not run yet) means nobody is suspended; any other error fails closed.
  if (suspension.error && !SCHEMA_MISSING.has(suspension.error.code)) throw toDbError(suspension.error);
  const own = ownership.data as OwnershipRow | null;
  const c = own?.characters ?? null;
  return {
    id: uid,
    email: typeof claims.email === "string" ? claims.email : "",
    character: own && c ? { db_id: own.character_id, region: c.region, server_id: c.server_id, character_id: c.character_id, name: c.character_name, profile_image: c.profile_image } : null,
    guild_id: (membership.data?.guild_id as string | undefined) ?? null,
    role: (membership.data?.role as "leader" | "member" | undefined) ?? null,
    suspended: !suspension.error && !!suspension.data,
  };
}

export async function requireUser(request: Request): Promise<(AuthContext & { response?: never }) | { response: NextResponse }> {
  void request; // auth cookies are read through next/headers
  let supabase: SupabaseClient;
  try {
    supabase = await createSupabaseServerClient();
  } catch (e) {
    if (e instanceof SupabaseNotConfiguredError) return { response: denied(503, "NOT_CONFIGURED", "The server is not fully configured for database access.") };
    throw e;
  }
  try {
    const user = await loadSessionUser(supabase);
    if (user?.suspended) return { response: denied(403, "ACCOUNT_SUSPENDED", "This account has been suspended.") };
    return user ? { user, supabase } : { response: unauthorized() };
  } catch (e) {
    const err = toDbError(e as { message?: string; code?: string });
    return { response: denied(err.status, err.code, err.message) };
  }
}

/**
 * Signed-in user who belongs to a guild. `leader: true` additionally
 * requires the Guild Leader (server-side permission check; RLS re-checks).
 */
export async function requireGuild(
  request: Request,
  opts: { leader?: boolean } = {},
): Promise<(GuildContext & { response?: never }) | { response: NextResponse }> {
  const auth = await requireUser(request);
  if ("response" in auth && auth.response) return { response: auth.response };
  const { user, supabase } = auth as AuthContext;
  if (!user.guild_id) return { response: denied(403, "NO_GUILD", "Join or create a guild first.") };
  const { data, error } = await supabase.from("guilds").select("id, name, leader_user_id, created_at").eq("id", user.guild_id).maybeSingle();
  if (error) {
    const err = toDbError(error);
    return { response: denied(err.status, err.code, err.message) };
  }
  if (!data) return { response: denied(403, "NO_GUILD", "Your guild no longer exists. Join or create a guild.") };
  const isLeader = user.role === "leader";
  if (opts.leader && !isLeader) return { response: denied(403, "LEADER_ONLY", "Only the Guild Leader can do this.") };
  return { user, supabase, guildId: data.id as string, guild: data as GuildRecord, isLeader };
}
