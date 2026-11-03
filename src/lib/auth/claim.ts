/**
 * SERVER-ONLY: finish registration by claiming the character chosen at sign-up.
 *
 * Email confirmation is ON, so `signUp` returns no session and the claim can't
 * run in the registration request. The character row is written server-side at
 * registration (from the AION 2 API) and its uuid is kept in the user's
 * metadata as `pending_character_id`. After the email is confirmed (or on the
 * first sign-in) this calls `claim_character` AS THE USER — the RPC enforces
 * one owner per character, one character per account, and links an existing
 * roster entry (joining that guild) instead of creating a duplicate.
 *
 * user_metadata is user-editable, so it is only a request: the RPC is the
 * authority, and it can only claim an existing, still-unowned character.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") {
  throw new Error("auth/claim is server-only.");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type ClaimOutcome = "none" | "claimed" | "taken" | "failed";

export async function claimPendingCharacter(supabase: SupabaseClient): Promise<ClaimOutcome> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const pending = user?.user_metadata?.pending_character_id;
  if (!user || typeof pending !== "string" || !UUID_RE.test(pending)) return "none";

  const own = await supabase.from("character_ownerships").select("character_id").eq("user_id", user.id).maybeSingle();
  if (own.error) return "failed";
  if (!own.data) {
    const { error } = await supabase.rpc("claim_character", { p_character: pending });
    if (error) {
      const taken = /^(CHARACTER_TAKEN|ALREADY_HAS_CHARACTER|CHARACTER_NOT_FOUND):/.test(error.message ?? "");
      if (!taken) return "failed"; // keep the request; retried on the next sign-in
      await supabase.auth.updateUser({ data: { pending_character_id: null } });
      return "taken";
    }
  }
  await supabase.auth.updateUser({ data: { pending_character_id: null } });
  return own.data ? "none" : "claimed";
}
