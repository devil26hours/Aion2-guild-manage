import { requireUser } from "@/lib/auth/context";
import { isDeveloper } from "@/lib/auth/developer";
import { json, storageFailure } from "@/lib/roster/http";
import { toDbError } from "@/lib/supabase/errors";

/** GET /api/auth/me — the signed-in account, its guild and its role there. */
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const { user, supabase } = auth;
  try {
    let guild = null;
    if (user.guild_id) {
      const [g, code] = await Promise.all([
        supabase.from("guilds").select("id, name").eq("id", user.guild_id).maybeSingle(),
        supabase.rpc("guild_join_code_set"),
      ]);
      if (g.error) throw toDbError(g.error);
      if (code.error) throw toDbError(code.error);
      if (g.data) guild = { id: g.data.id as string, name: g.data.name as string, role: user.role ?? "member", join_code_set: code.data === true };
    }
    const c = user.character;
    const is_developer = await isDeveloper(supabase);
    return json({
      user: {
        id: user.id,
        email: user.email,
        character: c ? { region: c.region, server_id: c.server_id, character_id: c.character_id, name: c.name } : null,
        guild_id: guild ? user.guild_id : null,
        bootstrap: false,
        is_developer,
      },
      guild,
    });
  } catch (e) {
    return storageFailure(e);
  }
}
