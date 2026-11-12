-- =====================================================================
-- AION 2 Guild Command — 0015 Background character refresh (every 30 min)
--
-- A scheduled job (Railway Cron → POST /api/cron/refresh-characters) re-fetches
-- the profiles of characters the app already stores and shows: rows holding a
-- full profile (api_raw) that are on a guild roster or owned by an account.
-- It never discovers new characters (search-only directory rows are skipped).
--
--   * characters.last_refresh_attempt_at → last time ANY refresh (job) tried this row.
--                                          (api_updated_at = last SUCCESS, unchanged meaning;
--                                           last_seen_at = directory "seen in search", unrelated.)
--   * characters.refresh_fail_count      → consecutive failures, for exponential back-off.
--   * character_refresh_runs             → one row per job run: counts, duration, status.
--   * start / heartbeat / finish_character_refresh_run() → run lock: at most one live run.
--   * claim_characters_for_refresh()     → atomically picks + leases the next batch
--                                          (FOR UPDATE SKIP LOCKED), stalest first.
--   * upsert_character_from_api / record_character_refresh_error → same bodies as before,
--     plus resetting / counting refresh_fail_count.
--
-- All new functions are service_role only. RLS on the new table, no client access.
-- Safe to run twice. Depends on 0001, 0003 and 0014 (last_seen_at).
-- =====================================================================

alter table public.characters add column if not exists last_refresh_attempt_at timestamptz;
alter table public.characters add column if not exists refresh_fail_count integer not null default 0;

-- Stalest first among the rows the job may pick.
create index if not exists characters_refresh_order_idx
  on public.characters (api_updated_at nulls first, last_refresh_attempt_at nulls first)
  where api_raw is not null;

create table if not exists public.character_refresh_runs (
  id            bigint generated always as identity primary key,
  trigger       text not null default 'cron' check (trigger in ('cron', 'manual')),
  status        text not null default 'running' check (status in ('running', 'completed', 'failed', 'abandoned')),
  started_at    timestamptz not null default now(),
  heartbeat_at  timestamptz not null default now(),
  finished_at   timestamptz,
  processed     integer not null default 0,
  succeeded     integer not null default 0,
  unchanged     integer not null default 0,   -- succeeded, but nothing new for the history
  failed        integer not null default 0,
  duration_ms   integer,
  note          text
);
create index if not exists character_refresh_runs_started_idx on public.character_refresh_runs (started_at desc);
alter table public.character_refresh_runs enable row level security;
revoke all on table public.character_refresh_runs from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Run lock. Returns the new run id, or null when another run is alive
-- (heartbeat within p_stale_seconds). A run whose heartbeat stopped is
-- marked 'abandoned' (its leased rows simply become due again later).
-- The advisory lock serialises two jobs starting at the same moment.
-- ---------------------------------------------------------------------
create or replace function public.start_character_refresh_run(p_trigger text default 'cron', p_stale_seconds integer default 900)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('public.character_refresh_runs'));
  update public.character_refresh_runs
     set status = 'abandoned', finished_at = now(), note = coalesce(note, 'heartbeat stopped')
   where status = 'running' and heartbeat_at < now() - make_interval(secs => greatest(p_stale_seconds, 60));
  if exists (select 1 from public.character_refresh_runs where status = 'running') then
    return null;
  end if;
  insert into public.character_refresh_runs (trigger) values (case when p_trigger = 'manual' then 'manual' else 'cron' end)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.heartbeat_character_refresh_run(p_run bigint, p_processed integer, p_succeeded integer, p_unchanged integer, p_failed integer)
returns void
language sql security definer set search_path = '' as $$
  update public.character_refresh_runs
     set heartbeat_at = now(), processed = p_processed, succeeded = p_succeeded, unchanged = p_unchanged, failed = p_failed
   where id = p_run and status = 'running'
$$;

create or replace function public.finish_character_refresh_run(
  p_run bigint, p_status text, p_processed integer, p_succeeded integer, p_unchanged integer, p_failed integer, p_note text default null
) returns void
language sql security definer set search_path = '' as $$
  update public.character_refresh_runs
     set status = case when p_status in ('completed', 'failed') then p_status else 'failed' end,
         finished_at = now(),
         heartbeat_at = now(),
         processed = p_processed, succeeded = p_succeeded, unchanged = p_unchanged, failed = p_failed,
         duration_ms = (extract(epoch from (now() - started_at)) * 1000)::integer,
         note = left(p_note, 500)
   where id = p_run and status = 'running'
$$;

-- ---------------------------------------------------------------------
-- Pick and lease the next batch. Eligible: a stored profile, on a roster or
-- owned; not refreshed successfully within p_min_age_seconds; not attempted
-- within the back-off window (p_min_age_seconds × 2^failures, capped at 24 h).
-- Leasing = setting last_refresh_attempt_at now, so a concurrent or later
-- claim cannot take the same rows; an interrupted run's rows are due again
-- after the window. Stalest successful refresh first.
-- ---------------------------------------------------------------------
create or replace function public.claim_characters_for_refresh(p_limit integer default 20, p_min_age_seconds integer default 1500)
returns table (
  id uuid, region text, server_id text, character_id text, character_name text, class_name text,
  level integer, combat_power bigint, item_level numeric, server_name text, profile_image text, api_updated_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare v_age interval := make_interval(secs => greatest(coalesce(p_min_age_seconds, 1500), 60));
begin
  return query
  with picked as (
    select c.id
      from public.characters c
     where c.api_raw is not null
       and (exists (select 1 from public.guild_roster_members r where r.character_id = c.id)
            or exists (select 1 from public.character_ownerships o where o.character_id = c.id))
       and (c.api_updated_at is null or c.api_updated_at < now() - v_age)
       and (c.last_refresh_attempt_at is null
            or c.last_refresh_attempt_at < now() - least(v_age * power(2, least(c.refresh_fail_count, 6)), interval '24 hours'))
     order by c.api_updated_at nulls first, c.last_refresh_attempt_at nulls first, c.id
     limit least(greatest(coalesce(p_limit, 20), 1), 100)
     for update of c skip locked
  )
  update public.characters c
     set last_refresh_attempt_at = now()
    from picked
   where c.id = picked.id
  returning c.id, c.region, c.server_id, c.character_id, c.character_name, c.class_name,
            c.level, c.combat_power, c.item_level, c.server_name, c.profile_image, c.api_updated_at;
end $$;

-- ---------------------------------------------------------------------
-- Same as 0014 (incl. last_seen_at), plus: a success clears the failure count.
-- ---------------------------------------------------------------------
create or replace function public.upsert_character_from_api(
  p_region text,
  p_server_id text,
  p_character_id text,
  p_character_name text,
  p_class_name text,
  p_level integer,
  p_combat_power bigint,
  p_item_level numeric,
  p_server_name text,
  p_profile_image text,
  p_api_raw jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.characters as c (
    region, server_id, character_id, character_name, class_name, level, combat_power,
    item_level, server_name, profile_image, api_raw, api_updated_at, last_refresh_error, last_seen_at, refresh_fail_count
  ) values (
    p_region, p_server_id, p_character_id, p_character_name, p_class_name, p_level, p_combat_power,
    p_item_level, p_server_name, p_profile_image, p_api_raw, now(), null, now(), 0
  )
  on conflict (region, server_id, character_id) do update set
    character_name = excluded.character_name,
    class_name = excluded.class_name,
    level = excluded.level,
    combat_power = excluded.combat_power,
    item_level = excluded.item_level,
    server_name = excluded.server_name,
    profile_image = excluded.profile_image,
    api_raw = excluded.api_raw,
    api_updated_at = now(),
    last_refresh_error = null,
    last_seen_at = now(),
    refresh_fail_count = 0
  returning c.id into v_id;
  return v_id;
end $$;

-- Same as 0003, plus counting consecutive failures for the back-off.
create or replace function public.record_character_refresh_error(p_character uuid, p_status integer, p_message text)
returns void
language sql security definer set search_path = '' as $$
  update public.characters
     set last_refresh_error = jsonb_build_object('at', now(), 'status', p_status, 'message', left(p_message, 500)),
         refresh_fail_count = least(refresh_fail_count + 1, 1000)
   where id = p_character
$$;

revoke all on function public.start_character_refresh_run(text, integer) from public, anon, authenticated;
revoke all on function public.heartbeat_character_refresh_run(bigint, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.finish_character_refresh_run(bigint, text, integer, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function public.claim_characters_for_refresh(integer, integer) from public, anon, authenticated;
revoke all on function public.upsert_character_from_api(text, text, text, text, text, integer, bigint, numeric, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.record_character_refresh_error(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.start_character_refresh_run(text, integer) to service_role;
grant execute on function public.heartbeat_character_refresh_run(bigint, integer, integer, integer, integer) to service_role;
grant execute on function public.finish_character_refresh_run(bigint, text, integer, integer, integer, integer, text) to service_role;
grant execute on function public.claim_characters_for_refresh(integer, integer) to service_role;
grant execute on function public.upsert_character_from_api(text, text, text, text, text, integer, bigint, numeric, text, text, jsonb) to service_role;
grant execute on function public.record_character_refresh_error(uuid, integer, text) to service_role;
