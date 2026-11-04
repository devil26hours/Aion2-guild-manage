-- =====================================================================
-- AION 2 Guild Command — 0009 DEV tools: user suspension, notifications,
-- API Lab password, system overview.
-- Run after 0008, manually, in Supabase Dashboard → SQL Editor.
-- Additive and re-runnable: no existing table, policy, grant or row is changed.
--
-- Model (same as 0008): new tables have RLS enabled and NO client access;
-- everything goes through functions. DEV functions are SECURITY DEFINER and
-- check is_developer() themselves; user functions only ever look at auth.uid().
-- =====================================================================

-- ---------------------------------------------------------------------
-- Suspension
-- ---------------------------------------------------------------------
create table if not exists public.user_suspensions (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  reason        text check (reason is null or char_length(reason) <= 300),
  suspended_by  uuid references auth.users (id) on delete set null,
  suspended_at  timestamptz not null default now()
);
alter table public.user_suspensions enable row level security;
revoke all on public.user_suspensions from anon, authenticated;
-- A user may see only their own row (the proxy / handlers check it per request).
grant select (user_id, suspended_at) on public.user_suspensions to authenticated;
drop policy if exists user_suspensions_select_own on public.user_suspensions;
create policy user_suspensions_select_own on public.user_suspensions for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.dev_list_users(
  p_search text default null,
  p_status text default null,        -- 'active' | 'suspended' | null
  p_limit int default 20,
  p_offset int default 0
) returns table (
  id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean,
  display_name text, character_name text, guild_id uuid, guild_name text, guild_role text,
  is_developer boolean, suspended boolean, suspended_reason text, suspended_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pat text;
begin
  if not (select public.is_developer()) then
    raise exception 'FORBIDDEN: Developer access required.';
  end if;
  if nullif(btrim(p_search), '') is not null then
    v_pat := '%' || replace(replace(replace(left(btrim(p_search), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at, (u.email_confirmed_at is not null),
           p.display_name, c.character_name, g.id, g.name, gm.role::text,
           (d.user_id is not null), (s.user_id is not null), s.reason, s.suspended_at,
           count(*) over ()
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.guild_memberships gm on gm.user_id = u.id
      left join public.guilds g on g.id = gm.guild_id
      left join public.character_ownerships co on co.user_id = u.id
      left join public.characters c on c.id = co.character_id
      left join public.developers d on d.user_id = u.id
      left join public.user_suspensions s on s.user_id = u.id
     where (p_status is null
            or (p_status = 'suspended' and s.user_id is not null)
            or (p_status = 'active' and s.user_id is null))
       and (v_pat is null or u.email ilike v_pat or p.display_name ilike v_pat or c.character_name ilike v_pat)
     order by u.created_at desc
     limit greatest(1, least(coalesce(p_limit, 20), 50))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.dev_list_users(text, text, int, int) from public, anon;
grant execute on function public.dev_list_users(text, text, int, int) to authenticated;

create or replace function public.dev_set_suspension(
  p_user_id uuid,
  p_suspended boolean,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not exists (select 1 from public.developers d where d.user_id = v_uid) then
    raise exception 'FORBIDDEN: Developer access required.';
  end if;
  if p_suspended is null then
    raise exception 'INVALID_BODY: Missing suspended flag.';
  end if;
  if p_user_id = v_uid then
    raise exception 'INVALID_BODY: You cannot suspend your own account.';
  end if;
  if exists (select 1 from public.developers d where d.user_id = p_user_id) then
    raise exception 'INVALID_BODY: Developer accounts cannot be suspended here.';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'NOT_FOUND: User not found.';
  end if;
  if p_reason is not null and char_length(p_reason) > 300 then
    raise exception 'INVALID_BODY: The reason is too long (max 300 characters).';
  end if;

  if p_suspended then
    insert into public.user_suspensions (user_id, reason, suspended_by)
    values (p_user_id, nullif(btrim(p_reason), ''), v_uid)
    on conflict (user_id) do update
      set reason = excluded.reason, suspended_by = excluded.suspended_by, suspended_at = now();
  else
    delete from public.user_suspensions where user_id = p_user_id;
  end if;
end;
$$;
revoke all on function public.dev_set_suspension(uuid, boolean, text) from public, anon;
grant execute on function public.dev_set_suspension(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- Announcements & notifications
--  kind 'announcement'  → audience {'all'} (every signed-in user)
--  kind 'notification'  → one or more of 'dev', 'leader', 'member'
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('announcement', 'notification')),
  title       text not null check (char_length(btrim(title)) between 3 and 120),
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  audience    text[] not null check (
                cardinality(audience) between 1 and 4
                and audience <@ array['all', 'dev', 'leader', 'member']::text[]),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_created_idx on public.notifications (created_at desc);

create table if not exists public.notification_reads (
  user_id          uuid not null references auth.users (id) on delete cascade,
  notification_id  uuid not null references public.notifications (id) on delete cascade,
  read_at          timestamptz not null default now(),
  primary key (user_id, notification_id)
);
create index if not exists notification_reads_notification_idx on public.notification_reads (notification_id);

alter table public.notifications      enable row level security;
alter table public.notification_reads enable row level security;
revoke all on public.notifications, public.notification_reads from anon, authenticated;
-- No policies: nothing is reachable except through the functions below.

create or replace function public.notification_visible(p_audience text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    'all' = any (p_audience)
    or ('dev' = any (p_audience) and exists (select 1 from public.developers d where d.user_id = (select auth.uid())))
    or ('leader' = any (p_audience) and exists (select 1 from public.guild_memberships m where m.user_id = (select auth.uid()) and m.role = 'leader'))
    or ('member' = any (p_audience) and exists (select 1 from public.guild_memberships m where m.user_id = (select auth.uid()) and m.role = 'member'))
  );
$$;
revoke all on function public.notification_visible(text[]) from public, anon;
grant execute on function public.notification_visible(text[]) to authenticated;

create or replace function public.my_notifications(p_limit int default 30)
returns table (id uuid, kind text, title text, body text, created_at timestamptz, is_read boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.kind, n.title, n.body, n.created_at,
         exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.user_id = (select auth.uid()))
    from public.notifications n
   where public.notification_visible(n.audience)
   order by n.created_at desc
   limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;
revoke all on function public.my_notifications(int) from public, anon;
grant execute on function public.my_notifications(int) to authenticated;

create or replace function public.my_unread_count()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
    from public.notifications n
   where public.notification_visible(n.audience)
     and not exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.user_id = (select auth.uid()));
$$;
revoke all on function public.my_unread_count() from public, anon;
grant execute on function public.my_unread_count() to authenticated;

-- p_ids null → mark everything visible as read.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  insert into public.notification_reads (user_id, notification_id)
  select v_uid, n.id
    from public.notifications n
   where public.notification_visible(n.audience)
     and (p_ids is null or n.id = any (p_ids))
  on conflict do nothing;
end;
$$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

create or replace function public.dev_create_notification(
  p_kind text,
  p_title text,
  p_body text,
  p_audience text[] default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_aud text[];
  v_id uuid;
begin
  if v_uid is null or not exists (select 1 from public.developers d where d.user_id = v_uid) then
    raise exception 'FORBIDDEN: Developer access required.';
  end if;
  if p_kind not in ('announcement', 'notification') then
    raise exception 'INVALID_BODY: Invalid kind.';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 120 then
    raise exception 'INVALID_BODY: The title must be 3–120 characters.';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'INVALID_BODY: The message must be 1–2000 characters.';
  end if;
  if p_kind = 'announcement' then
    v_aud := array['all'];
  else
    select coalesce(array_agg(distinct a), '{}') into v_aud from unnest(coalesce(p_audience, '{}')) a;
    if cardinality(v_aud) = 0 or not (v_aud <@ array['dev', 'leader', 'member']::text[]) then
      raise exception 'INVALID_BODY: Choose at least one valid role.';
    end if;
  end if;
  insert into public.notifications (kind, title, body, audience, created_by)
  values (p_kind, btrim(p_title), btrim(p_body), v_aud, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.dev_create_notification(text, text, text, text[]) from public, anon;
grant execute on function public.dev_create_notification(text, text, text, text[]) to authenticated;

create or replace function public.dev_list_notifications(p_limit int default 20, p_offset int default 0)
returns table (
  id uuid, kind text, title text, body text, audience text[], created_at timestamptz,
  read_count bigint, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_developer()) then
    raise exception 'FORBIDDEN: Developer access required.';
  end if;
  return query
    select n.id, n.kind, n.title, n.body, n.audience, n.created_at,
           (select count(*) from public.notification_reads r where r.notification_id = n.id),
           count(*) over ()
      from public.notifications n
     order by n.created_at desc
     limit greatest(1, least(coalesce(p_limit, 20), 50))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.dev_list_notifications(int, int) from public, anon;
grant execute on function public.dev_list_notifications(int, int) to authenticated;

create or replace function public.dev_delete_notification(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_developer()) then
    raise exception 'FORBIDDEN: Developer access required.';
  end if;
  delete from public.notifications where id = p_id;
  if not found then
    raise exception 'NOT_FOUND: Notification not found.';
  end if;
end;
$$;
revoke all on function public.dev_delete_notification(uuid) from public, anon;
grant execute on function public.dev_delete_notification(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- API Lab password: a bcrypt hash, managed by DEV through these functions
-- (never an environment variable, never readable by any client).
-- ---------------------------------------------------------------------
create table if not exists public.dev_secrets (
  key         text primary key check (key in ('api_lab_password')),
  value_hash  text not null,
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);
alter table public.dev_secrets enable row level security;
revoke all on public.dev_secrets from anon, authenticated;

create or replace function public.dev_api_lab_status()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_developer()) then
    raise exception 'FORBIDDEN: Developer access required.';
  end if;
  return exists (select 1 from public.dev_secrets where key = 'api_lab_password');
end;
$$;
revoke all on function public.dev_api_lab_status() from public, anon;
grant execute on function public.dev_api_lab_status() to authenticated;

create or replace function public.dev_verify_api_lab_password(p_password text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  if not (select public.is_developer()) then
    raise exception 'FORBIDDEN: Developer access required.';
  end if;
  select value_hash into v_hash from public.dev_secrets where key = 'api_lab_password';
  if v_hash is null or p_password is null or p_password = '' then
    return false;
  end if;
  return extensions.crypt(p_password, v_hash) = v_hash;
end;
$$;
revoke all on function public.dev_verify_api_lab_password(text) from public, anon;
grant execute on function public.dev_verify_api_lab_password(text) to authenticated;

-- First password: p_current is ignored. Changing it requires the current password.
create or replace function public.dev_set_api_lab_password(p_new text, p_current text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_hash text;
begin
  if v_uid is null or not exists (select 1 from public.developers d where d.user_id = v_uid) then
    raise exception 'FORBIDDEN: Developer access required.';
  end if;
  if p_new is null or char_length(p_new) < 10 or char_length(p_new) > 72 then
    raise exception 'INVALID_BODY: The password must be 10–72 characters.';
  end if;
  select value_hash into v_hash from public.dev_secrets where key = 'api_lab_password';
  if v_hash is not null and (p_current is null or extensions.crypt(p_current, v_hash) <> v_hash) then
    raise exception 'WRONG_PASSWORD: The current password is incorrect.';
  end if;
  insert into public.dev_secrets (key, value_hash, updated_by, updated_at)
  values ('api_lab_password', extensions.crypt(p_new, extensions.gen_salt('bf', 10)), v_uid, now())
  on conflict (key) do update
    set value_hash = excluded.value_hash, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end;
$$;
revoke all on function public.dev_set_api_lab_password(text, text) from public, anon;
grant execute on function public.dev_set_api_lab_password(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- System overview (counts and recent guild ids only; no personal data)
-- ---------------------------------------------------------------------
create or replace function public.dev_system_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_developer()) then
    raise exception 'FORBIDDEN: Developer access required.';
  end if;
  return jsonb_build_object(
    'generated_at', now(),
    'users', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
      'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'active_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
      'suspended', (select count(*) from public.user_suspensions),
      'developers', (select count(*) from public.developers)
    ),
    'guilds', jsonb_build_object(
      'total', (select count(*) from public.guilds),
      'memberships', (select count(*) from public.guild_memberships),
      'leaders', (select count(*) from public.guild_memberships where role = 'leader'),
      'roster_members', (select count(*) from public.guild_roster_members),
      'party_presets', (select count(*) from public.party_presets)
    ),
    'characters', jsonb_build_object(
      'total', (select count(*) from public.characters),
      'owned', (select count(*) from public.character_ownerships),
      'snapshots', (select count(*) from public.character_snapshots)
    ),
    'feedback', jsonb_build_object(
      'total', (select count(*) from public.feedback),
      'pending', (select count(*) from public.feedback where status = 'pending'),
      'reviewing', (select count(*) from public.feedback where status = 'reviewing'),
      'resolved', (select count(*) from public.feedback where status = 'resolved'),
      'rejected', (select count(*) from public.feedback where status = 'rejected')
    ),
    'notifications', jsonb_build_object(
      'announcements', (select count(*) from public.notifications where kind = 'announcement'),
      'notifications', (select count(*) from public.notifications where kind = 'notification')
    ),
    'activity_24h', jsonb_build_object(
      'audit_events', (select count(*) from public.guild_audit_log where created_at > now() - interval '1 day'),
      'failed_join_attempts', (select count(*) from public.guild_join_attempts where not succeeded and attempted_at > now() - interval '1 day'),
      'feedback_received', (select count(*) from public.feedback where created_at > now() - interval '1 day')
    ),
    'recent_guilds', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'created_at', g.created_at,
                                           'members', (select count(*) from public.guild_memberships m where m.guild_id = g.id))
                       order by g.created_at desc)
        from (select * from public.guilds order by created_at desc limit 5) g
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.dev_system_overview() from public, anon;
grant execute on function public.dev_system_overview() to authenticated;
