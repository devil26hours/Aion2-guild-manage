import { createHmac } from "node:crypto";
import { clientIp, rateLimit } from "@/lib/auth/config";
import { validateFeedback } from "@/lib/feedback/validate";
import { fail, json, readJsonBody, storageFailure } from "@/lib/roster/http";
import { serverWriteProblem, supabaseAdmin } from "@/lib/supabase/admin";
import { toDbError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/feedback — { category, subject, description, page_url?, website? }
 * Open to signed-out visitors (listed in src/proxy.ts). The sender comes from the
 * verified session only, never from the body. The row is written by the
 * service-role-only submit_feedback() function, which re-validates and rate-limits
 * in the database. Failures never expose database details.
 */
export async function POST(request: Request) {
  // Cross-site pages may not post here.
  const origin = request.headers.get("origin");
  if (origin) {
    let sameHost = false;
    try {
      sameHost = new URL(origin).host === (request.headers.get("host") ?? new URL(request.url).host);
    } catch {
      /* malformed origin */
    }
    if (!sameHost) return fail(403, "FORBIDDEN", "Cross-site requests are not allowed.");
  }

  const ip = clientIp(request);
  if (!rateLimit(`feedback:${ip}`, 5, 10 * 60 * 1000)) {
    return fail(429, "RATE_LIMITED", "You have sent a lot of feedback recently. Please try again later.");
  }

  const body = await readJsonBody(request, 16 * 1024);
  if (!body) return fail(400, "INVALID_BODY", "Invalid request.");
  // Honeypot: real users never fill this hidden field. Pretend success so bots learn nothing.
  if (typeof body.website === "string" && body.website !== "") return json({ ok: true }, 201);

  const parsed = validateFeedback(body);
  if (!parsed.ok) return fail(400, "INVALID_BODY", parsed.message);
  const { category, subject, description, pageUrl } = parsed.value;

  if (serverWriteProblem()) return fail(503, "NOT_CONFIGURED", "Feedback is temporarily unavailable.");

  try {
    // Optional identity: the verified JWT, if there is a session.
    let userId: string | null = null;
    let email: string | null = null;
    let name: string | null = null;
    try {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.auth.getClaims();
      const claims = data?.claims;
      if (claims && typeof claims.sub === "string") {
        userId = claims.sub;
        email = typeof claims.email === "string" ? claims.email : null;
        const own = await supabase.from("character_ownerships").select("characters(character_name)").eq("user_id", userId).maybeSingle();
        name = (own.data as { characters: { character_name: string } | null } | null)?.characters?.character_name ?? null;
      }
    } catch {
      /* treat as signed out */
    }

    const ipHash = createHmac("sha256", process.env.SUPABASE_SECRET_KEY!.trim()).update(ip).digest("hex");
    const { error } = await supabaseAdmin().rpc("submit_feedback", {
      p_category: category,
      p_subject: subject,
      p_description: description,
      p_page_url: pageUrl,
      p_user_id: userId,
      p_submitter_name: name,
      p_submitter_email: email,
      p_ip_hash: ipHash,
      p_user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300) || null,
    });
    if (error) {
      const e = toDbError(error, "Could not send your feedback.");
      // Only the app's own rule messages are shown; anything else is generic.
      if (["RATE_LIMITED", "FEEDBACK_DUPLICATE", "INVALID_BODY"].includes(e.code)) return fail(e.status, e.code, e.message);
      console.error("[feedback] submit failed:", error.code);
      return fail(500, "FEEDBACK_FAILED", "Could not send your feedback. Please try again later.");
    }
    return json({ ok: true }, 201);
  } catch (e) {
    console.error("[feedback] unexpected error");
    return storageFailure(e);
  }
}
