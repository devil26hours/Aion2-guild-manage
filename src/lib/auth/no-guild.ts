import type { SupabaseClient } from "@supabase/supabase-js";

/** Auth user_metadata key set when an account explicitly chose "Continue Without a Guild" (routing hint only, grants nothing). */
export const NO_GUILD_META_KEY = "no_guild_chosen";

/**
 * Remove the "chose No Guild" hint once the account has actually created/joined a guild.
 * Best effort: the guild already exists at this point, and the hint grants nothing, so a failure is ignored.
 */
export async function clearNoGuildChoice(supabase: SupabaseClient): Promise<void> {
  await supabase.auth.updateUser({ data: { [NO_GUILD_META_KEY]: null } }).catch(() => undefined);
}
