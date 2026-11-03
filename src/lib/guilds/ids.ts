/** Guild identifiers and the join-code format (shared by the guild Route Handlers). */

/** Guild ids are Postgres uuids (public.guilds.id). */
export const GUILD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const JOIN_CODE_RE = /^\d{4}$/;
