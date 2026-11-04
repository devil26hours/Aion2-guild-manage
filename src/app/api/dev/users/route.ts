import { requireDeveloper } from "@/lib/auth/developer";
import { USERS_PAGE_SIZE, type DevUser } from "@/lib/dev/types";
import { fail, json, storageFailure } from "@/lib/roster/http";
import { toDbError } from "@/lib/supabase/errors";

/**
 * GET /api/dev/users?q=&status=active|suspended&page=1 — DEV only.
 * dev_list_users re-checks the DEV role in the database.
 */
export async function GET(request: Request) {
  const auth = await requireDeveloper(request);
  if (auth.response) return auth.response;

  const sp = new URL(request.url).searchParams;
  const status = sp.get("status");
  if (status && status !== "active" && status !== "suspended") return fail(400, "INVALID_BODY", "Invalid status.");
  const page = Math.min(Math.max(Number.parseInt(sp.get("page") ?? "1", 10) || 1, 1), 10_000);

  try {
    const { data, error } = await auth.supabase.rpc("dev_list_users", {
      p_search: (sp.get("q") ?? "").slice(0, 100) || null,
      p_status: status || null,
      p_limit: USERS_PAGE_SIZE,
      p_offset: (page - 1) * USERS_PAGE_SIZE,
    });
    if (error) throw toDbError(error);
    const rows = (data ?? []) as (DevUser & { total_count: number | string })[];
    const items: DevUser[] = rows.map((row) => {
      const { total_count, ...user } = row;
      void total_count;
      return user;
    });
    return json({ items, total: rows.length ? Number(rows[0].total_count) : 0, page, page_size: USERS_PAGE_SIZE });
  } catch (e) {
    return storageFailure(e);
  }
}
