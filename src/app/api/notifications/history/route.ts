import { requireUser } from "@/lib/auth/context";
import { HISTORY_PAGE_SIZE, isHistoryStatus, isMyKind, type HistoryPage, type MyNotification } from "@/lib/notifications/schema";
import { fail, json, storageFailure } from "@/lib/roster/http";
import { toDbError } from "@/lib/supabase/errors";

type Row = MyNotification & { total_count: number | string };

/**
 * GET /api/notifications/history?page=1&status=all|unread|read&kind=announcement|notification|guild
 * The signed-in user's own history, 20 per page. Scoping happens in the database (auth.uid()
 * and the viewer's role), never from the request.
 */
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const params = new URL(request.url).searchParams;
  const status = params.get("status") ?? "all";
  const kind = params.get("kind");
  if (!isHistoryStatus(status) || (kind !== null && kind !== "" && !isMyKind(kind))) return fail(400, "INVALID_BODY", "Invalid filter.");
  let page = Math.min(Math.max(Number.parseInt(params.get("page") ?? "1", 10) || 1, 1), 10_000);
  try {
    const fetchPage = async (p: number) => {
      const { data, error } = await auth.supabase.rpc("my_notifications_page", {
        p_limit: HISTORY_PAGE_SIZE,
        p_offset: (p - 1) * HISTORY_PAGE_SIZE,
        p_status: status,
        p_kind: kind || null,
      });
      if (error) throw toDbError(error);
      return (data ?? []) as Row[];
    };
    let rows = await fetchPage(page);
    // Past the last page (e.g. after deleting the final item on it): fall back to the first page.
    if (rows.length === 0 && page > 1) {
      page = 1;
      rows = await fetchPage(1);
    }
    const items: MyNotification[] = rows.map(({ total_count, ...n }) => {
      void total_count;
      return n;
    });
    const body: HistoryPage = { items, total: rows.length ? Number(rows[0].total_count) : 0, page, page_size: HISTORY_PAGE_SIZE };
    return json(body);
  } catch (e) {
    return storageFailure(e);
  }
}
