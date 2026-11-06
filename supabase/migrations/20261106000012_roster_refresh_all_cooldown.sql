-- =====================================================================
-- AION 2 Guild Command — 0012 Refresh All cooldown (one guild-wide timer)
--
-- "Refresh All" on the Guild Members page may start once every 10 minutes per
-- guild, whoever presses it: the refreshed data is shared, so a second run soon
-- after only repeats the upstream API calls and adds duplicate snapshots.
--
--   * guild_refresh_state               → last start per guild. RPC access only.
--   * roster_refresh_all_seconds_left() → seconds until the caller's guild may start.
--   * start_roster_refresh_all()        → claims the slot atomically.
--
-- The refresh of a single member is not limited by this.
-- Times are compared on the database clock, so a wrong device clock has no effect.
--
-- Safe to run twice. Depends on 0001.
-- =====================================================================

create table if not exists public.guild_refresh_state (
  guild_id            uuid primary key references public.guilds (id) on delete cascade,
  last_refresh_all_at timestamptz not null
);
alter table public.guild_refresh_state enable row level security;
revoke all on table public.guild_refresh_state from public, anon, authenticated;

-- The cooldown length lives here only. Internal: called by the functions below.
create or replace function public.refresh_all_seconds_left_from(p_last timestamptz)
returns int
language sql
stable
set search_path = ''
as $$
  select greatest(0, ceil(extract(epoch from (p_last + interval '10 minutes' - now()))))::int;
$$;
revoke all on function public.refresh_all_seconds_left_from(timestamptz) from public, anon, authenticated;

-- 0 when the caller's guild may start now (or has never started).
create or replace function public.roster_refresh_all_seconds_left()
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_guild uuid;
  v_last timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  v_guild := public.current_guild_id();
  if v_guild is null then
    raise exception 'NOT_IN_GUILD: You do not belong to a guild.';
  end if;
  select s.last_refresh_all_at into v_last from public.guild_refresh_state s where s.guild_id = v_guild;
  return coalesce(public.refresh_all_seconds_left_from(v_last), 0);
end;
$$;
revoke all on function public.roster_refresh_all_seconds_left() from public, anon;
grant execute on function public.roster_refresh_all_seconds_left() to authenticated;

-- Claims the slot for the caller's guild. The insert / conditional update is one
-- statement: when two members press together, the second waits on the row lock,
-- sees the first one's time and is refused. Returns { started, seconds_left }.
create or replace function public.start_roster_refresh_all()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guild uuid;
  v_last timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  v_guild := public.current_guild_id();
  if v_guild is null then
    raise exception 'NOT_IN_GUILD: You do not belong to a guild.';
  end if;

  insert into public.guild_refresh_state as s (guild_id, last_refresh_all_at)
  values (v_guild, now())
  on conflict (guild_id) do update
    set last_refresh_all_at = excluded.last_refresh_all_at
    where public.refresh_all_seconds_left_from(s.last_refresh_all_at) = 0
  returning s.last_refresh_all_at into v_last;

  if found then
    return jsonb_build_object('started', true, 'seconds_left', public.refresh_all_seconds_left_from(v_last));
  end if;

  select s.last_refresh_all_at into v_last from public.guild_refresh_state s where s.guild_id = v_guild;
  return jsonb_build_object('started', false, 'seconds_left', greatest(1, public.refresh_all_seconds_left_from(v_last)));
end;
$$;
revoke all on function public.start_roster_refresh_all() from public, anon;
grant execute on function public.start_roster_refresh_all() to authenticated;
