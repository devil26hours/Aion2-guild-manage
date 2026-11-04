-- =====================================================================
-- AION 2 Guild Command — 0010 notification history
--
-- Reuses public.notifications / public.notification_reads from 0009 (no new tables):
--   * notification_reads.deleted_at  → a user's personal "delete". The row is that
--     user's own copy marker; the notification itself and everyone else's state
--     are untouched. A deleted notification also counts as read.
--   * 90-day retention: every user-facing read ignores notifications older than
--     90 days, and purge_old_notifications() removes them (cascades to the reads).
--   * my_notifications_page(): paginated, filterable history for /notifications.
--
-- Safe to run twice. Depends on 0009.
-- =====================================================================

alter table public.notification_reads add column if not exists deleted_at timestamptz;

-- ---------------------------------------------------------------------
-- Retention: hard-delete notifications older than 90 days (reads cascade).
-- Internal only — not callable from the API.
-- ---------------------------------------------------------------------
create or replace function public.purge_old_notifications()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  delete from public.notifications where created_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.purge_old_notifications() from public, anon, authenticated;

-- Daily purge where pg_cron exists (Supabase). Elsewhere the 90-day filter in the
-- read functions still hides old rows, and delete_my_notifications() purges lazily.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('purge-old-notifications', '17 3 * * *', 'select public.purge_old_notifications()');
  end if;
exception when others then
  raise notice 'pg_cron not available, skipping scheduled purge: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------
-- Bell list: now skips personally-deleted rows and rows past retention.
-- (same signature as 0009)
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
   where public.notification_visible(n.audience)
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
  -- A reads row (deleted or not) means "read", so unread = no row at all.
  select count(*)::int
    from public.notifications n
   where public.notification_visible(n.audience)
     and n.created_at > now() - interval '90 days'
     and not exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.user_id = (select auth.uid()));
$$;
revoke all on function public.my_unread_count() from public, anon;
grant execute on function public.my_unread_count() to authenticated;

-- ---------------------------------------------------------------------
-- History page: filter by status ('all' | 'unread' | 'read') and kind, offset paging.
-- total_count is the filtered total (same value on every row).
-- ---------------------------------------------------------------------
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
  if p_kind is not null and p_kind not in ('announcement', 'notification') then
    raise exception 'INVALID_BODY: Invalid type filter.';
  end if;
  return query
    select n.id, n.kind, n.title, n.body, n.created_at, r.user_id is not null, count(*) over ()
      from public.notifications n
      left join public.notification_reads r on r.notification_id = n.id and r.user_id = (select auth.uid())
     where public.notification_visible(n.audience)
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

-- ---------------------------------------------------------------------
-- Mark read: same behaviour, but only inside retention. A previously deleted row
-- already exists, so `on conflict do nothing` never brings it back.
-- ---------------------------------------------------------------------
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
     and n.created_at > now() - interval '90 days'
     and (p_ids is null or n.id = any (p_ids))
  on conflict do nothing;
end;
$$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- Personal delete: hides the caller's copy only. Ids the caller cannot see are
-- silently ignored, so another role's notification can never be touched; the
-- notification row itself is never deleted here. Returns how many were removed.
-- ---------------------------------------------------------------------
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
     and public.notification_visible(n.audience)
  on conflict (user_id, notification_id)
  do update set deleted_at = coalesce(public.notification_reads.deleted_at, excluded.deleted_at)
  where public.notification_reads.user_id = v_uid;
  get diagnostics v_count = row_count;
  -- Lazy retention for installs without pg_cron (cheap: created_at is indexed).
  perform public.purge_old_notifications();
  return v_count;
end;
$$;
revoke all on function public.delete_my_notifications(uuid[]) from public, anon;
grant execute on function public.delete_my_notifications(uuid[]) to authenticated;
