/** Feedback constants shared by the browser forms and the Route Handlers. The database re-checks the same limits. */

export const FEEDBACK_CATEGORIES = ["bug", "feature", "general", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_STATUSES = ["pending", "reviewing", "resolved", "rejected"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 120;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 4000;
export const NOTE_MAX = 4000;
export const PAGE_SIZE = 20;

/** English labels (passed through t() in the UI). */
export const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  bug: "Bug Report",
  feature: "Feature Request",
  general: "General Feedback",
  other: "Other",
};
export const CATEGORY_HINT: Record<FeedbackCategory, string> = {
  bug: "Report an issue or error",
  feature: "Suggest a new feature",
  general: "General comments or suggestions",
  other: "Anything else",
};
export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  pending: "Pending",
  reviewing: "Reviewing",
  resolved: "Resolved",
  rejected: "Rejected",
};

export const isCategory = (v: unknown): v is FeedbackCategory => typeof v === "string" && (FEEDBACK_CATEGORIES as readonly string[]).includes(v);
export const isStatus = (v: unknown): v is FeedbackStatus => typeof v === "string" && (FEEDBACK_STATUSES as readonly string[]).includes(v);

/** A feedback row as the DEV dashboard receives it. */
export interface FeedbackItem {
  id: string;
  category: FeedbackCategory;
  subject: string;
  description: string;
  page_url: string | null;
  status: FeedbackStatus;
  user_id: string | null;
  submitter_name: string | null;
  submitter_email: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  dev_note: string | null;
  dev_note_updated_at: string | null;
}
