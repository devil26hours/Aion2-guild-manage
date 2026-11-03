/** SERVER-ONLY: serve a guild's uploaded image from Storage (auth is checked by the calling route). */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fail, storageFailure } from "@/lib/roster/http";
import { GUILD_IMAGE_TYPES, type GuildImageType } from "./schema";
import { GUILD_IMAGE_BUCKET } from "./storage";

if (typeof window !== "undefined") {
  throw new Error("settings/guild-image is server-only.");
}

/**
 * `sb` must be allowed to read the object: the member's own client (Storage
 * RLS: guild members), or the admin client for the public guild browser.
 */
export async function serveGuildImage(sb: SupabaseClient, path: string | null, contentType: string | null): Promise<Response> {
  if (!path || !contentType || !(GUILD_IMAGE_TYPES as readonly string[]).includes(contentType)) {
    return fail(404, "NO_IMAGE", "No guild image has been uploaded.");
  }
  try {
    const { data, error } = await sb.storage.from(GUILD_IMAGE_BUCKET).download(path);
    if (error || !data) return fail(404, "IMAGE_MISSING", "The guild image file is missing in storage.");
    const bytes = new Uint8Array(await data.arrayBuffer());
    return new Response(bytes, {
      headers: {
        "content-type": contentType as GuildImageType,
        "content-length": String(bytes.length),
        "cache-control": "private, max-age=0, must-revalidate",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'",
      },
    });
  } catch (e) {
    return storageFailure(e);
  }
}
