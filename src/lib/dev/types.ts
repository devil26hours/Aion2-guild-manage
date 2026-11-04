/** Shapes shared by the DEV pages and Route Handlers. */

export const USERS_PAGE_SIZE = 20;

export interface DevUser {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  display_name: string | null;
  character_name: string | null;
  guild_id: string | null;
  guild_name: string | null;
  guild_role: "leader" | "member" | null;
  is_developer: boolean;
  suspended: boolean;
  suspended_reason: string | null;
  suspended_at: string | null;
}

export interface SystemOverview {
  generated_at: string;
  users: { total: number; confirmed: number; new_7d: number; active_30d: number; suspended: number; developers: number };
  guilds: { total: number; memberships: number; leaders: number; roster_members: number; party_presets: number };
  characters: { total: number; owned: number; snapshots: number };
  feedback: { total: number; pending: number; reviewing: number; resolved: number; rejected: number };
  notifications: { announcements: number; notifications: number };
  activity_24h: { audit_events: number; failed_join_attempts: number; feedback_received: number };
  recent_guilds: { id: string; name: string; created_at: string; members: number }[];
  server: {
    your_user_id: string;
    supabase_project_ref: string | null;
    secret_key_configured: boolean;
    character_api_configured: boolean;
    node_env: string | null;
    runtime: string;
    commit: string | null;
  };
}
