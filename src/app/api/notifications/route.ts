import { requireUser } from "@/lib/auth/context";
import { BELL_LIMIT, type MyNotification } from "@/lib/notifications/schema";
import { json, storageFailure } from "@/lib/roster/http";
import { toDbError } from "@/lib/supabase/errors";

/**
 * GET /api/notifications — the signed-in user's own bell: { unread, items? } (items: the 10 most recent).
 * `?count=1` returns only the unread count (cheap poll). What a user can see is decided
 * in the database from their own role (notification_visible), never from the request.
 */
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const countOnly = new URL(request.url).searchParams.get("count") === "1";
  try {
    const unread = await auth.supabase.rpc("my_unread_count");
    // Migration 0009 not applied yet: show an empty bell instead of an error.
    if (unread.error?.code === "PGRST202") return json({ unread: 0, items: [] });
    if (unread.error) throw toDbError(unread.error);
    if (countOnly) return json({ unread: Number(unread.data) });
    const list = await auth.supabase.rpc("my_notifications", { p_limit: BELL_LIMIT });
    if (list.error) throw toDbError(list.error);
    return json({ unread: Number(unread.data), items: (list.data ?? []) as MyNotification[] });
  } catch (e) {
    return storageFailure(e);
  }
}
