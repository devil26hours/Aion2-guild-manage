/** SERVER-ONLY validation of untrusted feedback input. Returns clean values or a user-safe message. */

import { DESCRIPTION_MAX, DESCRIPTION_MIN, isCategory, SUBJECT_MAX, SUBJECT_MIN, type FeedbackCategory } from "./schema";

if (typeof window !== "undefined") {
  throw new Error("feedback/validate is server-only.");
}

export interface NewFeedback {
  category: FeedbackCategory;
  subject: string;
  description: string;
  pageUrl: string | null;
}

// Control characters other than tab / newline (NUL, escape sequences) and bidi overrides.
export const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]|\p{Bidi_Control}/gu;
// A same-site path only: no scheme, no host, no query string, no fragment.
const SAFE_PATH = /^\/(?![/\\])[A-Za-z0-9\-._~%/[\]@!$&'()*+,;=:]{0,299}$/;

export const cleanText = (s: string) => s.replace(/\r\n?/g, "\n").replace(CONTROL_CHARS, "");

export function validateFeedback(body: Record<string, unknown>): { ok: true; value: NewFeedback } | { ok: false; message: string } {
  if (!isCategory(body.category)) return { ok: false, message: "Choose a category." };
  if (typeof body.subject !== "string" || typeof body.description !== "string") return { ok: false, message: "Enter a subject and a description." };
  // The subject is a single line.
  const subject = cleanText(body.subject.slice(0, SUBJECT_MAX * 3)).replace(/\s*\n\s*/g, " ").trim();
  const description = cleanText(body.description.slice(0, DESCRIPTION_MAX * 2)).trim();
  if (subject.length < SUBJECT_MIN || subject.length > SUBJECT_MAX) return { ok: false, message: `The subject must be ${SUBJECT_MIN}–${SUBJECT_MAX} characters.` };
  if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    return { ok: false, message: `The description must be ${DESCRIPTION_MIN}–${DESCRIPTION_MAX} characters.` };
  }
  const pageUrl = typeof body.page_url === "string" && SAFE_PATH.test(body.page_url) ? body.page_url : null;
  return { ok: true, value: { category: body.category, subject, description, pageUrl } };
}
