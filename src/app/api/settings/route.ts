import { requireGuild } from "@/lib/auth/context";
import { fail, json, readJsonBody, storageFailure } from "@/lib/roster/http";
import { applySettingsPatch } from "@/lib/settings/schema";
import {
  readSettingsFile,
  removeGuildImageObject,
  resetSettings,
  toSettings,
  writeAdminSection,
  writeGuildSection,
  writePrefsSection,
} from "@/lib/settings/storage";

/** GET /api/settings — shared guild settings (same for every browser). */
export async function GET(request: Request) {
  const auth = await requireGuild(request);
  if (auth.response) return auth.response;
  try {
    return json({ settings: toSettings(await readSettingsFile(auth.supabase, auth.guildId)) });
  } catch (e) {
    return storageFailure(e);
  }
}

/** PATCH /api/settings — { section: "guild" | "admin" | "prefs", patch } (validated server-side). */
export async function PATCH(request: Request) {
  const auth = await requireGuild(request, { leader: true });
  if (auth.response) return auth.response;
  const { guildId, supabase } = auth;
  const body = await readJsonBody(request);
  if (!body) return fail(400, "INVALID_BODY", "Expected a JSON object body.");
  try {
    const current = toSettings(await readSettingsFile(supabase, guildId));
    const applied = applySettingsPatch(current, body.section, body.patch);
    if (!applied.ok) return fail(400, "INVALID_SETTINGS", applied.error);
    if (body.section === "guild") await writeGuildSection(supabase, guildId, applied.next.guild);
    else if (body.section === "admin") await writeAdminSection(supabase, guildId, applied.next.admin);
    else await writePrefsSection(supabase, guildId, applied.next.prefs);
    return json({ settings: toSettings(await readSettingsFile(supabase, guildId)) });
  } catch (e) {
    return storageFailure(e);
  }
}

/** DELETE /api/settings — restore default settings (also removes the uploaded guild image). */
export async function DELETE(request: Request) {
  const auth = await requireGuild(request, { leader: true });
  if (auth.response) return auth.response;
  const { guildId, supabase } = auth;
  try {
    const oldImage = (await readSettingsFile(supabase, guildId)).guild.image?.file ?? null;
    await resetSettings(supabase, guildId);
    await removeGuildImageObject(supabase, guildId, oldImage);
    return json({ settings: toSettings(await readSettingsFile(supabase, guildId)) });
  } catch (e) {
    return storageFailure(e);
  }
}
