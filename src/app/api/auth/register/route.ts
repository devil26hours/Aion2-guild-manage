import { NextResponse } from "next/server";
import { EMAIL_RE, normalizeEmail, PASSWORD_MAX, PASSWORD_MIN } from "@/lib/accounts/users";
import { claimPendingCharacter } from "@/lib/auth/claim";
import { clientIp, rateLimit } from "@/lib/auth/config";
import { confirmUrl } from "@/lib/auth/site-url";
import { fetchCharacterProfile } from "@/lib/roster/api-fetch";
import { readJsonBody, storageFailure } from "@/lib/roster/http";
import { findCharacterAdmin, upsertCharacterFromApi } from "@/lib/roster/storage";
import { CHARACTER_ID_RE, isRegion, SERVER_ID_RE } from "@/lib/roster/types";
import { serverWriteProblem } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message, status: null } }, { status, headers: { "cache-control": "no-store" } });

/**
 * POST /api/auth/register
 *   { email, password, character: { region, server_id, character_id, name } }
 *
 * 1. Validates email/password (Supabase Auth hashes and stores the password).
 * 2. Verifies the selected character really exists via the AION2 API (server-side)
 *    and stores its API data (service_role function — never client-sent stats).
 * 3. Character OWNERSHIP: the character must not belong to another account.
 * 4. Creates the Supabase Auth user. Email confirmation is ON: the account is
 *    usable after the link in the email is opened. The chosen character is kept
 *    as `pending_character_id` and claimed after confirmation (lib/auth/claim),
 *    which also links an existing roster record — no duplicate is created.
 */
export async function POST(request: Request) {
  if (!rateLimit(`register:${clientIp(request)}`, 10, 10 * 60 * 1000)) {
    return fail(429, "RATE_LIMITED", "Too many registration attempts. Wait a few minutes and try again.");
  }
  const body = await readJsonBody(request);
  if (!body) return fail(400, "INVALID_BODY", "Expected a JSON object body.");
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const c = body.character as Record<string, unknown> | undefined;

  if (!EMAIL_RE.test(email) || email.length > 120) return fail(400, "INVALID_EMAIL", "Enter a valid email address.");
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return fail(400, "WEAK_PASSWORD", `The password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`);
  }
  if (
    !c ||
    !isRegion(c.region) ||
    typeof c.server_id !== "string" ||
    !SERVER_ID_RE.test(c.server_id) ||
    typeof c.character_id !== "string" ||
    !CHARACTER_ID_RE.test(c.character_id) ||
    typeof c.name !== "string" ||
    !c.name.trim() ||
    c.name.length > 64
  ) {
    return fail(400, "NO_CHARACTER", "Search for and select your AION 2 character.");
  }
  const identity = { region: c.region, server_id: c.server_id, character_id: c.character_id };

  const problem = serverWriteProblem();
  if (problem) return fail(503, "NOT_CONFIGURED", "Registration is unavailable: the server is not fully configured for database writes.");

  try {
    const existing = await findCharacterAdmin(identity);
    if (existing?.owner) return fail(409, "CHARACTER_TAKEN", "This character is already linked to another account.");
  } catch (e) {
    return storageFailure(e);
  }

  // The character must exist (server-side lookup; client data is not trusted).
  const fetched = await fetchCharacterProfile(c.name.trim(), identity.server_id);
  if (!fetched.ok) return fail(fetched.status === 404 ? 404 : 502, "API_ERROR", fetched.message);
  if (fetched.mapped.character_id !== identity.character_id || fetched.mapped.server_id !== identity.server_id) {
    return fail(409, "IDENTITY_MISMATCH", "The AION2 API returned a different character than the one selected.");
  }

  let characterDbId: string;
  try {
    characterDbId = await upsertCharacterFromApi(identity, fetched.mapped, fetched.raw);
  } catch (e) {
    return storageFailure(e);
  }

  const supabase = await createSupabaseServerClient({ persistent: false });
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: confirmUrl(request, "/guild-setup"), data: { pending_character_id: characterDbId } },
  });
  if (error) {
    if (error.code === "weak_password") return fail(400, "WEAK_PASSWORD", error.message);
    if (error.code === "user_already_exists" || error.code === "email_exists") return fail(409, "EMAIL_TAKEN", "An account with this email already exists.");
    if (error.status === 429 || /rate limit/i.test(error.message)) return fail(429, "EMAIL_RATE_LIMITED", "Too many emails were sent. Wait a while and try again.");
    if (error.code === "signup_disabled") return fail(403, "SIGNUP_DISABLED", "New registrations are disabled.");
    return fail(502, "AUTH_ERROR", "The account could not be created. Try again later.");
  }

  // Confirmation disabled in the project → already signed in: claim now.
  if (data.session) {
    await claimPendingCharacter(supabase).catch(() => "failed");
    const { data: m } = await supabase.from("guild_memberships").select("guild_id").eq("user_id", data.session.user.id).maybeSingle();
    return NextResponse.json({ ok: true, confirmation_required: false, linked_guild: !!m }, { status: 201, headers: { "cache-control": "no-store" } });
  }
  // With confirmation on, Supabase answers the same way for an already-registered
  // email (no account enumeration); the email itself tells the owner what happened.
  return NextResponse.json({ ok: true, confirmation_required: true, linked_guild: false }, { status: 201, headers: { "cache-control": "no-store" } });
}
