import { randomBytes } from "node:crypto";
import { requireGuild } from "@/lib/auth/context";
import { serveGuildImage } from "@/lib/settings/guild-image";
import { fail, json, storageFailure } from "@/lib/roster/http";
import { GUILD_IMAGE_MAX_BYTES, type GuildImageRef, type GuildImageType } from "@/lib/settings/schema";
import {
  GUILD_IMAGE_BUCKET,
  guildImageObjectPath,
  readSettingsFile,
  removeGuildImageObject,
  toSettings,
  writeGuildImage,
} from "@/lib/settings/storage";
import { toDbError } from "@/lib/supabase/errors";

/**
 * Guild image (Supabase Storage, private bucket "guild-images").
 *   GET    → the current image bytes (guild members)
 *   POST   → multipart/form-data with `file` (PNG or JPEG, ≤ 1 MB) — Guild Leader
 *   DELETE → remove the image — Guild Leader
 * The type is detected from the file's magic bytes on the server; the
 * client-supplied name/extension/MIME type are ignored. Objects get a
 * server-generated name "<guild uuid>/guild-<id>-<hex>.<ext>" (Storage RLS
 * allows only that shape, and only for the guild's leader); the guild row
 * stores the reference.
 */

const MULTIPART_OVERHEAD = 64 * 1024;

function sniff(buf: Uint8Array): { type: GuildImageType; ext: "png" | "jpg" } | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length > 24 && png.every((b, i) => buf[i] === b) && String.fromCharCode(...buf.slice(12, 16)) === "IHDR") {
    return { type: "image/png", ext: "png" };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  return null;
}

export async function GET(request: Request) {
  const auth = await requireGuild(request);
  if (auth.response) return auth.response;
  try {
    const { data, error } = await auth.supabase.from("guilds").select("image_path, image_content_type").eq("id", auth.guildId).maybeSingle();
    if (error) throw toDbError(error);
    return serveGuildImage(auth.supabase, (data?.image_path as string | null) ?? null, (data?.image_content_type as string | null) ?? null);
  } catch (e) {
    return storageFailure(e);
  }
}

export async function POST(request: Request) {
  const auth = await requireGuild(request, { leader: true });
  if (auth.response) return auth.response;
  const { guildId, supabase } = auth;

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > GUILD_IMAGE_MAX_BYTES + MULTIPART_OVERHEAD) return fail(413, "TOO_LARGE", "The image must be 1 MB or smaller.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "INVALID_BODY", "Expected multipart/form-data with a `file` field.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "INVALID_BODY", "Expected multipart/form-data with a `file` field.");
  if (file.size === 0) return fail(400, "EMPTY_FILE", "The selected file is empty.");
  if (file.size > GUILD_IMAGE_MAX_BYTES) return fail(413, "TOO_LARGE", "The image must be 1 MB or smaller.");

  const buf = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(buf);
  if (!kind) return fail(415, "UNSUPPORTED_TYPE", "Only PNG and JPEG images are allowed (the file content is not a PNG or JPEG).");

  const name = `guild-${Date.now().toString(36)}-${randomBytes(8).toString("hex")}.${kind.ext}`;
  const path = guildImageObjectPath(guildId, name);
  if (!path) return fail(500, "INTERNAL", "Could not create a safe file name.");

  let old: string | null;
  try {
    old = (await readSettingsFile(supabase, guildId)).guild.image?.file ?? null;
  } catch (e) {
    return storageFailure(e);
  }

  const up = await supabase.storage.from(GUILD_IMAGE_BUCKET).upload(path, buf, { contentType: kind.type, upsert: false });
  if (up.error) return fail(500, "IO_ERROR", "Could not store the image in Supabase Storage.");

  const ref: GuildImageRef = { file: name, content_type: kind.type, size: buf.length, uploaded_at: new Date().toISOString() };
  try {
    await writeGuildImage(supabase, guildId, ref);
  } catch (e) {
    await removeGuildImageObject(supabase, guildId, name);
    return storageFailure(e);
  }
  // Replace safely: the old object is removed only after the new reference is saved.
  if (old && old !== name) await removeGuildImageObject(supabase, guildId, old);
  try {
    return json({ settings: toSettings(await readSettingsFile(supabase, guildId)) });
  } catch (e) {
    return storageFailure(e);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireGuild(request, { leader: true });
  if (auth.response) return auth.response;
  const { guildId, supabase } = auth;
  try {
    const old = (await readSettingsFile(supabase, guildId)).guild.image?.file ?? null;
    if (old) {
      await writeGuildImage(supabase, guildId, null);
      await removeGuildImageObject(supabase, guildId, old);
    }
    return json({ settings: toSettings(await readSettingsFile(supabase, guildId)) });
  } catch (e) {
    return storageFailure(e);
  }
}
