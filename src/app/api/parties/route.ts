import { requireGuild } from "@/lib/auth/context";
import { parsePartyOp } from "@/lib/party/ops";
import { applyPartyFileOp, readPartyFile } from "@/lib/party/storage";
import { fail, json, readJsonBody, storageFailure } from "@/lib/roster/http";

/** GET /api/parties — all party presets/compositions (shared by every browser). */
export async function GET(request: Request) {
  const auth = await requireGuild(request);
  if (auth.response) return auth.response;
  try {
    const f = await readPartyFile(auth.supabase, auth.guildId);
    return json({ presets: f.presets, updated_at: f.updated_at });
  } catch (e) {
    return storageFailure(e);
  }
}

/**
 * POST /api/parties — { op: PartyOp } — applies ONE validated operation
 * (Guild Leader only; RLS re-checks) and returns the full, updated preset list.
 */
export async function POST(request: Request) {
  const auth = await requireGuild(request, { leader: true });
  if (auth.response) return auth.response;
  const body = await readJsonBody(request, 64 * 1024);
  const op = parsePartyOp(body?.op);
  if (!op) return fail(400, "INVALID_OP", "Invalid party operation.");
  try {
    const r = await applyPartyFileOp(auth.supabase, auth.guildId, op);
    if (!r.ok) return json({ error: { code: "PARTY_RULE", message: r.error, status: null }, presets: r.presets }, 409);
    return json({ presets: r.presets });
  } catch (e) {
    return storageFailure(e);
  }
}
