-- =====================================================================
-- AION 2 Guild Command — 0011 Leave Guild (member leave + leader transfer)
--
-- Reuses guild_memberships, guilds, guild_roster_members and the
-- notifications tables. Changes:
--   * notifications.recipient_user_id  → a notification for exactly one user
--     (guild events are fanned out one row per recipient, so they can never
--     reach another guild). notification_is_for_me() decides visibility.
--   * notifications.kind may be 'guild' (system events). The DEV list skips
--     them, so the DEV dashboard is unchanged.
--   * leave_guild(p_new_leader)  → atomic leave / leadership transfer.
--   * leave_guild_candidates()   → eligible successors for the caller's guild.
--
-- Safe to run twice. Depends on 0009 and 0010.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Notification schema: per-user target + 'guild' kind
-- ---------------------------------------------------------------------
alter table public.notifications
  add column if not exists recipient_user_id uuid references auth.users (id) on delete cascade;
create index if not exists notifications_recipient_idx
  on public.notifications (recipient_user_id, created_at desc) where recipient_user_id is not null;

do $$
declare
  v_name text;
begin
  select c.conname into v_name
    from pg_constraint c
   where c.conrelid = 'public.notifications'::regclass
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) like '%announcement%'
     and pg_get_constraintdef(c.oid) like '%kind%';
  if v_name is not null then
    execute format('alter table public.notifications drop constraint %I', v_name);
  end if;
  alter table public.notifications drop constraint if exists notifications_kind_check;
  alter table public.notifications
    add constraint notifications_kind_check check (kind in ('announcement', 'notification', 'guild'));
end;
$$;

-- A row with a recipient is visible to that user only; otherwise the role audience rules apply.
create or replace function public.notification_is_for_me(p_audience text[], p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_recipient is not null then p_recipient = (select auth.uid())
    else public.notification_visible(p_audience)
  end;
$$;
revoke all on function public.notification_is_for_me(text[], uuid) from public, anon;
grant execute on function public.notification_is_for_me(text[], uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Read functions from 0010, now recipient-aware (bodies otherwise unchanged)
-- ---------------------------------------------------------------------
create or replace function public.my_notifications(p_limit int default 30)
returns table (id uuid, kind text, title text, body text, created_at timestamptz, is_read boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.kind, n.title, n.body, n.created_at, r.user_id is not null
    from public.notifications n
    left join public.notification_reads r on r.notification_id = n.id and r.user_id = (select auth.uid())
   where public.notification_is_for_me(n.audience, n.recipient_user_id)
     and n.created_at > now() - interval '90 days'
     and r.deleted_at is null
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
   where public.notification_is_for_me(n.audience, n.recipient_user_id)
     and n.created_at > now() - interval '90 days'
     and not exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.user_id = (select auth.uid()));
$$;
revoke all on function public.my_unread_count() from public, anon;
grant execute on function public.my_unread_count() to authenticated;

create or replace function public.my_notifications_page(
  p_limit int default 20,
  p_offset int default 0,
  p_status text default 'all',
  p_kind text default null
)
returns table (id uuid, kind text, title text, body text, created_at timestamptz, is_read boolean, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if p_status not in ('all', 'unread', 'read') then
    raise exception 'INVALID_BODY: Invalid status filter.';
  end if;
  if p_kind is not null and p_kind not in ('announcement', 'notification', 'guild') then
    raise exception 'INVALID_BODY: Invalid type filter.';
  end if;
  return query
    select n.id, n.kind, n.title, n.body, n.created_at, r.user_id is not null, count(*) over ()
      from public.notifications n
      left join public.notification_reads r on r.notification_id = n.id and r.user_id = (select auth.uid())
     where public.notification_is_for_me(n.audience, n.recipient_user_id)
       and n.created_at > now() - interval '90 days'
       and r.deleted_at is null
       and (p_kind is null or n.kind = p_kind)
       and (p_status = 'all'
            or (p_status = 'unread' and r.user_id is null)
            or (p_status = 'read' and r.user_id is not null))
     order by n.created_at desc, n.id
     limit greatest(1, least(coalesce(p_limit, 20), 50))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.my_notifications_page(int, int, text, text) from public, anon;
grant execute on function public.my_notifications_page(int, int, text, text) to authenticated;

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
   where public.notification_is_for_me(n.audience, n.recipient_user_id)
     and n.created_at > now() - interval '90 days'
     and (p_ids is null or n.id = any (p_ids))
  on conflict do nothing;
end;
$$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

create or replace function public.delete_my_notifications(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count int;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 100 then
    raise exception 'INVALID_BODY: Choose 1–100 notifications.';
  end if;
  insert into public.notification_reads (user_id, notification_id, deleted_at)
  select v_uid, n.id, now()
    from public.notifications n
   where n.id = any (p_ids)
     and public.notification_is_for_me(n.audience, n.recipient_user_id)
  on conflict (user_id, notification_id)
  do update set deleted_at = coalesce(public.notification_reads.deleted_at, excluded.deleted_at)
  where public.notification_reads.user_id = v_uid;
  get diagnostics v_count = row_count;
  perform public.purge_old_notifications();
  return v_count;
end;
$$;
revoke all on function public.delete_my_notifications(uuid[]) from public, anon;
grant execute on function public.delete_my_notifications(uuid[]) to authenticated;

-- DEV list: guild events are system rows, not something a DEV composed → hidden here.
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
     where n.kind <> 'guild'
     order by n.created_at desc
     limit greatest(1, least(coalesce(p_limit, 20), 50))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.dev_list_notifications(int, int) from public, anon;
grant execute on function public.dev_list_notifications(int, int) to authenticated;

-- ---------------------------------------------------------------------
-- leave_guild_candidates — leader only: members of the caller's own guild who
-- can take over (role 'member', not suspended). Nothing is taken from the client.
-- ---------------------------------------------------------------------
create or replace function public.leave_guild_candidates()
returns table (user_id uuid, display_name text, character_name text, class_name text, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_guild uuid;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  select m.guild_id into v_guild from public.guild_memberships m where m.user_id = v_uid and m.role = 'leader';
  if v_guild is null then
    raise exception 'LEADER_ONLY: Only the Guild Leader can do this.';
  end if;
  return query
    select m.user_id, p.display_name, c.character_name, c.class_name, m.joined_at
      from public.guild_memberships m
      join public.profiles p on p.id = m.user_id
      left join public.character_ownerships o on o.user_id = m.user_id
      left join public.characters c on c.id = o.character_id
     where m.guild_id = v_guild
       and m.role = 'member'
       and not exists (select 1 from public.user_suspensions s where s.user_id = m.user_id)
     order by m.joined_at, m.user_id;
end;
$$;
revoke all on function public.leave_guild_candidates() from public, anon;
grant execute on function public.leave_guild_candidates() to authenticated;

-- ---------------------------------------------------------------------
-- leave_guild — atomic.
--   Member:  p_new_leader must be null. Membership and roster entry are removed.
--   Leader:  p_new_leader is required and must be a current, non-suspended
--            'member' of the same guild. Leadership moves to them, then the
--            caller is removed. Exactly one leader exists before and after.
-- Both paths lock the guild row first, so concurrent leaves / transfers /
-- double submits run one after another; the loser fails with NOT_IN_GUILD or
-- INVALID_NEW_LEADER. Everything (including the notifications) is one transaction.
-- Returns { role, guild_id, new_leader_id }.
-- ---------------------------------------------------------------------
create or replace function public.leave_guild(p_new_leader uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_guild uuid;
  v_role public.guild_role;
  v_leader_label text;
  v_old_name text;
  v_new_name text;
  v_old_char text;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  -- Find the caller's guild, lock it, then re-read the membership under the lock.
  select m.guild_id into v_guild from public.guild_memberships m where m.user_id = v_uid;
  if v_guild is null then
    raise exception 'NOT_IN_GUILD: You do not belong to a guild.';
  end if;
  perform 1 from public.guilds g where g.id = v_guild for update;
  select m.role into v_role from public.guild_memberships m where m.user_id = v_uid and m.guild_id = v_guild;
  if v_role is null then
    raise exception 'NOT_IN_GUILD: You do not belong to a guild.';
  end if;

  select coalesce(c.character_name, p.display_name, 'สมาชิก'), c.character_name
    into v_old_name, v_old_char
    from public.profiles p
    left join public.character_ownerships o on o.user_id = p.id
    left join public.characters c on c.id = o.character_id
   where p.id = v_uid;

  if v_role = 'member' then
    if p_new_leader is not null then
      raise exception 'INVALID_NEW_LEADER: Only the Guild Leader chooses a successor.';
    end if;
  else
    if p_new_leader is null then
      raise exception 'NEW_LEADER_REQUIRED: Choose a new Guild Leader before leaving.';
    end if;
    if p_new_leader = v_uid
       or not exists (
         select 1 from public.guild_memberships m
          where m.user_id = p_new_leader and m.guild_id = v_guild and m.role = 'member'
       )
       or exists (select 1 from public.user_suspensions s where s.user_id = p_new_leader) then
      raise exception 'INVALID_NEW_LEADER: The selected member is not eligible to become Guild Leader.';
    end if;

    select coalesce(c.character_name, p.display_name, 'สมาชิก')
      into v_new_name
      from public.profiles p
      left join public.character_ownerships o on o.user_id = p.id
      left join public.characters c on c.id = o.character_id
     where p.id = p_new_leader;

    -- Transfer. Statement order keeps both unique rules (one leader row per guild,
    -- guilds.leader_user_id unique) satisfied after every statement.
    update public.guild_memberships set role = 'member' where user_id = v_uid and guild_id = v_guild;
    update public.guild_memberships set role = 'leader' where user_id = p_new_leader and guild_id = v_guild;
    update public.guilds set leader_user_id = p_new_leader where id = v_guild
    returning leader_label into v_leader_label;

    -- The free-text leader label would still name the person who left.
    if v_leader_label = '' or (v_old_char is not null and lower(v_leader_label) = lower(left(v_old_char, 24))) then
      update public.guilds set leader_label = left(coalesce(
        (select c.character_name from public.character_ownerships o join public.characters c on c.id = o.character_id where o.user_id = p_new_leader),
        ''), 24)
       where id = v_guild;
    end if;
  end if;

  -- Remove the character from this guild's roster (it is unique across guilds, so
  -- leaving it would block joining another one). The roster triggers also drop the
  -- membership; the explicit delete below covers accounts without a character.
  delete from public.guild_roster_members r
   where r.guild_id = v_guild
     and r.character_id in (select o.character_id from public.character_ownerships o where o.user_id = v_uid);
  delete from public.guild_memberships where user_id = v_uid and guild_id = v_guild;

  perform public.write_audit(v_guild, 'guild.leave', jsonb_build_object('user_id', v_uid, 'was_leader', v_role = 'leader', 'new_leader_id', p_new_leader));

  -- Notifications: one row per recipient, every recipient exactly once, never the leaver.
  if v_role = 'member' then
    insert into public.notifications (kind, title, body, audience, recipient_user_id, created_by)
    select 'guild', 'สมาชิกออกจากกิลด์',
           format('%s ได้ออกจากกิลด์แล้ว', v_old_name),
           array['member'], m.user_id, v_uid
      from public.guild_memberships m
     where m.guild_id = v_guild;
  else
    insert into public.notifications (kind, title, body, audience, recipient_user_id, created_by)
    select 'guild',
           case when m.user_id = p_new_leader then 'คุณเป็นหัวหน้ากิลด์คนใหม่' else 'หัวหน้ากิลด์ออกจากกิลด์' end,
           case when m.user_id = p_new_leader
                then format('%s ได้ออกจากกิลด์และโอนตำแหน่งหัวหน้ากิลด์ให้คุณ', v_old_name)
                else format('%s ได้ออกจากกิลด์ และ %s เป็นหัวหน้ากิลด์คนใหม่', v_old_name, v_new_name) end,
           array['member'], m.user_id, v_uid
      from public.guild_memberships m
     where m.guild_id = v_guild;
  end if;

  return jsonb_build_object('role', v_role, 'guild_id', v_guild, 'new_leader_id', p_new_leader);
end;
$$;
revoke all on function public.leave_guild(uuid) from public, anon;
grant execute on function public.leave_guild(uuid) to authenticated;
