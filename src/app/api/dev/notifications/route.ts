import { requireDeveloper } from "@/lib/auth/developer";
import { cleanText } from "@/lib/feedback/validate";
import { BODY_MAX, isAudienceRole, isKind, TITLE_MAX, TITLE_MIN, type DevNotification } from "@/lib/notifications/schema";
import { fail, json, readJsonBody, storageFailure } from "@/lib/roster/http";
import { toDbError } from "@/lib/supabase/errors";

const PAGE_SIZE = 20;

/** GET /api/dev/notifications?page=1 — DEV only: everything that was sent, with read counts. */
export async function GET(request: Request) {
  const auth = await requireDeveloper(request);
  if (auth.response) return auth.response;
  const page = Math.min(Math.max(Number.parseInt(new URL(request.url).searchParams.get("page") ?? "1", 10) || 1, 1), 10_000);
  try {
    const { data, error } = await auth.supabase.rpc("dev_list_notifications", { p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE });
    if (error) throw toDbError(error);
    const rows = (data ?? []) as (DevNotification & { total_count: number | string; read_count: number | string })[];
    const items: DevNotification[] = rows.map((row) => {
      const { total_count, ...n } = row;
      void total_count;
      return { ...n, read_count: Number(n.read_count) };
    });
    return json({ items, total: rows.length ? Number(rows[0].total_count) : 0, page, page_size: PAGE_SIZE });
  } catch (e) {
    return storageFailure(e);
  }
}

/** POST /api/dev/notifications — { kind, title, body, audience? } — DEV only. */
export async function POST(request: Request) {
  const auth = await requireDeveloper(request);
  if (auth.response) return auth.response;
  const body = await readJsonBody(request, 16 * 1024);
  if (!body || !isKind(body.kind) || typeof body.title !== "string" || typeof body.body !== "string") return fail(400, "INVALID_BODY", "Invalid request.");

  const title = cleanText(body.title).replace(/\s*\n\s*/g, " ").trim();
  const text = cleanText(body.body).trim();
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) return fail(400, "INVALID_BODY", `The title must be ${TITLE_MIN}–${TITLE_MAX} characters.`);
  if (text.length < 1 || text.length > BODY_MAX) return fail(400, "INVALID_BODY", `The message must be 1–${BODY_MAX} characters.`);

  let audience: string[] | null = null;
  if (body.kind === "notification") {
    if (!Array.isArray(body.audience) || body.audience.length === 0 || !body.audience.every(isAudienceRole)) {
      return fail(400, "INVALID_BODY", "Choose at least one role.");
    }
    audience = [...new Set(body.audience as string[])];
  }

  try {
    const { data, error } = await auth.supabase.rpc("dev_create_notification", { p_kind: body.kind, p_title: title, p_body: text, p_audience: audience });
    if (error) throw toDbError(error);
    return json({ ok: true, id: data as string }, 201);
  } catch (e) {
    return storageFailure(e);
  }
}
