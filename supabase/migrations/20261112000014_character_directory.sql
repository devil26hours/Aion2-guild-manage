-- =====================================================================
-- AION 2 Guild Command — 0014 Character Directory (self-filling)
--
-- Character Lookup searches a directory of characters the app has already
-- SEEN, before (and alongside) the live NCSOFT name search. There is no
-- endpoint that lists every character, so the directory is filled only from
-- responses the app already receives — it never holds every character and
-- must never be presented as complete.
--
-- Reuses public.characters (no second character table):
--   * last_seen_at                    → when a search result or profile last confirmed the row.
--   * pg_trgm GIN index               → case-insensitive substring search on the name.
--   * upsert_character_directory()    → saves live search hits (service_role only).
--   * prune_character_directory()     → drops search-only rows a COMPLETE live answer no longer contains.
--   * search_character_directory()    → paged directory search (service_role only; the Next.js
--                                        route exposes only the public lookup fields).
--   * upsert_character_from_api()     → replaced with the same body plus last_seen_at = now().
--
-- Rows created from search alone have api_raw = null and api_updated_at = null:
-- nothing else in the app reads characters outside ownerships / roster joins,
-- so they stay invisible to guild pages.
--
-- Safe to run twice. Depends on 0001 and 0003.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

alter table public.characters add column if not exists last_seen_at timestamptz;
update public.characters
   set last_seen_at = coalesce(api_updated_at, updated_at, created_at)
 where last_seen_at is null;
alter table public.characters alter column last_seen_at set default now();

-- The opclass lives wherever pg_trgm was installed (extensions on Supabase, but
-- an older install may be in public), so the index is created dynamically.
do $$
declare v_schema text;
begin
  select n.nspname into v_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  execute format(
    'create index if not exists characters_name_trgm_idx on public.characters using gin (lower(character_name) %I.gin_trgm_ops)',
    v_schema
  );
end $$;

-- Region / server filters (and the prune below) narrow by these first.
create index if not exists characters_region_server_idx on public.characters (region, server_id);

-- ---------------------------------------------------------------------
-- upsert_character_directory — save live search hits.
-- p_rows: [{ region, server_id, character_id, character_name, server_name, level }, …] (max 200)
-- Invalid rows are skipped, not fatal. A row that already holds a full profile
-- (api_raw not null) keeps its own name and level: those come from the more
-- detailed profile refresh. Returns the number of rows inserted or updated.
-- ---------------------------------------------------------------------
create or replace function public.upsert_character_directory(p_rows jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'INVALID_BODY: rows must be an array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 200 then
    raise exception 'INVALID_BODY: at most 200 rows per call.' using errcode = '22023';
  end if;

  with src as (
    select distinct on (r.region, r.server_id, r.character_id)
           r.region, r.server_id, r.character_id,
           btrim(r.character_name) as character_name,
           nullif(btrim(r.server_name), '') as server_name,
           case when r.level between 1 and 999 then r.level end as level
      from jsonb_to_recordset(p_rows) as r(region text, server_id text, character_id text, character_name text, server_name text, level integer)
     where r.region in ('nae', 'naw', 'eu', 'la', 'as')
       and r.server_id ~ '^\d{3,6}$'
       and r.character_id ~ '^[A-Za-z0-9_\-=+/]{8,128}$'
       and char_length(btrim(r.character_name)) between 1 and 64
  )
  insert into public.characters as c (region, server_id, character_id, character_name, server_name, level, last_seen_at)
  select region, server_id, character_id, character_name, server_name, level, now() from src
  on conflict (region, server_id, character_id) do update set
    last_seen_at   = now(),
    server_name    = coalesce(excluded.server_name, c.server_name),
    character_name = case when c.api_raw is null then excluded.character_name else c.character_name end,
    level          = case when c.api_raw is null then coalesce(excluded.level, c.level) else c.level end;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- prune_character_directory — keep the directory from going stale.
-- Called after a live search whose answer was COMPLETE for the given regions
-- (fewer hits than one upstream page). Search-only rows (api_raw null) in those
-- regions whose name contains the keyword but which the live answer no longer
-- returned were renamed or deleted, so they are removed. Rows holding a profile,
-- owned or on a roster are never touched; neither is anything seen in the last
-- 10 minutes. Returns the number of rows removed.
-- ---------------------------------------------------------------------
create or replace function public.prune_character_directory(p_keyword text, p_regions text[], p_keep text[])
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_kw text := lower(btrim(coalesce(p_keyword, '')));
  v_pat text;
  v_count integer;
begin
  if char_length(v_kw) < 2 or char_length(v_kw) > 64 or coalesce(cardinality(p_regions), 0) = 0 then
    return 0;
  end if;
  v_pat := '%' || replace(replace(replace(v_kw, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  delete from public.characters c
   where c.api_raw is null
     and c.region = any (p_regions)
     and lower(c.character_name) like v_pat
     and c.last_seen_at < now() - interval '10 minutes'
     and (c.region || ':' || c.server_id || ':' || c.character_id) <> all (coalesce(p_keep, '{}'::text[]))
     and not exists (select 1 from public.character_ownerships o where o.character_id = c.id)
     and not exists (select 1 from public.guild_roster_members r where r.character_id = c.id)
     and not exists (select 1 from public.character_snapshots s where s.character_id = c.id);

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- search_character_directory — case-insensitive substring search, paged.
-- Exact name first, then names starting with the query, then shorter names,
-- then most recently seen. Rows not confirmed for 90 days are left out (the
-- live search finds them again if they still exist). Callers ask for one row
-- more than they show to learn whether another page exists.
-- ---------------------------------------------------------------------
create or replace function public.search_character_directory(
  p_query text,
  p_region text default null,
  p_server text default null,
  p_limit integer default 20,
  p_offset integer default 0
) returns table (
  character_id text,
  character_name text,
  region text,
  server_id text,
  server_name text,
  level integer,
  last_seen_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  with q as (
    select lower(btrim(coalesce(p_query, ''))) as v,
           replace(replace(replace(lower(btrim(coalesce(p_query, ''))), '\', '\\'), '%', '\%'), '_', '\_') as pat
  )
  select c.character_id, c.character_name, c.region, c.server_id, c.server_name, c.level, c.last_seen_at
    from public.characters c, q
   where q.v <> ''
     and char_length(q.v) <= 64
     and lower(c.character_name) like '%' || q.pat || '%'
     and (p_region is null or c.region = p_region)
     and (p_server is null or c.server_id = p_server)
     and c.last_seen_at > now() - interval '90 days'
   order by (lower(c.character_name) = q.v) desc,
            (lower(c.character_name) like q.pat || '%') desc,
            char_length(c.character_name),
            c.last_seen_at desc,
            c.region, c.server_id, c.character_id
   limit least(greatest(coalesce(p_limit, 20), 1), 51)
  offset least(greatest(coalesce(p_offset, 0), 0), 1000)
$$;

-- ---------------------------------------------------------------------
-- upsert_character_from_api — unchanged except last_seen_at = now(), so roster
-- refreshes, registration and guild joins keep the directory current too.
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
    item_level, server_name, profile_image, api_raw, api_updated_at, last_refresh_error, last_seen_at
  ) values (
    p_region, p_server_id, p_character_id, p_character_name, p_class_name, p_level, p_combat_power,
    p_item_level, p_server_name, p_profile_image, p_api_raw, now(), null, now()
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
    last_seen_at = now()
  returning c.id into v_id;
  return v_id;
end $$;

revoke all on function public.upsert_character_directory(jsonb) from public, anon, authenticated;
revoke all on function public.prune_character_directory(text, text[], text[]) from public, anon, authenticated;
revoke all on function public.search_character_directory(text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.upsert_character_from_api(text, text, text, text, text, integer, bigint, numeric, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_character_directory(jsonb) to service_role;
grant execute on function public.prune_character_directory(text, text[], text[]) to service_role;
grant execute on function public.search_character_directory(text, text, text, integer, integer) to service_role;
grant execute on function public.upsert_character_from_api(text, text, text, text, text, integer, bigint, numeric, text, text, jsonb) to service_role;
