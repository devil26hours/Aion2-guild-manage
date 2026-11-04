import { requireDeveloper } from "@/lib/auth/developer";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, PAGE_SIZE, type FeedbackItem } from "@/lib/feedback/schema";
import { fail, json, storageFailure } from "@/lib/roster/http";
import { toDbError } from "@/lib/supabase/errors";

/**
 * GET /api/dev/feedback?q=&category=&status=&sort=newest|oldest&page=1 — DEV only.
 * Runs as the DEV's own RLS-bound client (dev_list_feedback is SECURITY INVOKER),
 * so the database refuses non-developers even if this check were bypassed.
 */
export async function GET(request: Request) {
  const auth = await requireDeveloper(request);
  if (auth.response) return auth.response;

  const sp = new URL(request.url).searchParams;
  const category = sp.get("category");
  const status = sp.get("status");
  if (category && !(FEEDBACK_CATEGORIES as readonly string[]).includes(category)) return fail(400, "INVALID_BODY", "Invalid category.");
  if (status && !(FEEDBACK_STATUSES as readonly string[]).includes(status)) return fail(400, "INVALID_BODY", "Invalid status.");
  const page = Math.min(Math.max(Number.parseInt(sp.get("page") ?? "1", 10) || 1, 1), 10_000);

  try {
    const { data, error } = await auth.supabase.rpc("dev_list_feedback", {
      p_search: (sp.get("q") ?? "").slice(0, 100) || null,
      p_category: category || null,
      p_status: status || null,
      p_sort: sp.get("sort") === "oldest" ? "oldest" : "newest",
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    });
    if (error) throw toDbError(error);
    const rows = (data ?? []) as (FeedbackItem & { total_count: number | string })[];
    const total = rows.length ? Number(rows[0].total_count) : 0;
    const items: FeedbackItem[] = rows.map((row) => {
      const { total_count, ...item } = row;
      void total_count;
      return item;
    });
    return json({ items, total, page, page_size: PAGE_SIZE });
  } catch (e) {
    return storageFailure(e);
  }
}
