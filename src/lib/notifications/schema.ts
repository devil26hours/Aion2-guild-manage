/** Notification constants shared by the browser and the Route Handlers. The database re-checks the same limits. */

export const NOTIFICATION_KINDS = ["announcement", "notification"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Roles a notification can target. Announcements always go to everyone ("all"). There is no separate Admin role in this app. */
export const AUDIENCE_ROLES = ["dev", "leader", "member"] as const;
export type AudienceRole = (typeof AUDIENCE_ROLES)[number];

export const AUDIENCE_LABEL: Record<AudienceRole | "all", string> = {
  all: "Everyone",
  dev: "DEV",
  leader: "Guild Leader",
  member: "Member",
};

export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const BODY_MAX = 2000;

/** Kinds that can appear in a user's own list: DEV-composed ones plus system "guild" events (e.g. someone left). */
export const MY_KINDS = [...NOTIFICATION_KINDS, "guild"] as const;
export type MyKind = (typeof MY_KINDS)[number];
export const isMyKind = (v: unknown): v is MyKind => typeof v === "string" && (MY_KINDS as readonly string[]).includes(v);

export const isKind = (v: unknown): v is NotificationKind => typeof v === "string" && (NOTIFICATION_KINDS as readonly string[]).includes(v);
export const isAudienceRole = (v: unknown): v is AudienceRole => typeof v === "string" && (AUDIENCE_ROLES as readonly string[]).includes(v);

/** One entry of the signed-in user's bell list. */
export interface MyNotification {
  id: string;
  kind: MyKind;
  title: string;
  body: string;
  created_at: string;
  is_read: boolean;
}

export const HISTORY_PAGE_SIZE = 20;
/** Notifications older than this are hidden and purged (enforced in the database). */
export const RETENTION_DAYS = 90;
/** Number of entries the navbar bell lists. */
export const BELL_LIMIT = 10;

export const HISTORY_STATUSES = ["all", "unread", "read"] as const;
export type HistoryStatus = (typeof HISTORY_STATUSES)[number];
export const isHistoryStatus = (v: unknown): v is HistoryStatus => typeof v === "string" && (HISTORY_STATUSES as readonly string[]).includes(v);

/** One page of the /notifications history. */
export interface HistoryPage {
  items: MyNotification[];
  total: number;
  page: number;
  page_size: number;
}

/** One entry of the DEV management list. */
export interface DevNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  audience: (AudienceRole | "all")[];
  created_at: string;
  read_count: number;
}
