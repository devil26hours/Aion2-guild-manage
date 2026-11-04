-- =====================================================================
-- AION 2 Guild Command — 0008 community feedback + DEV role
-- Run after 0007, manually, in Supabase Dashboard → SQL Editor.
-- Additive and re-runnable: no existing table, policy, grant or row is changed.
--
-- Model:
--  * DEV is NOT a guild role. It is a row in public.developers. Nobody can
--    write that table through the API (no grants, no policies); the first DEV is
--    added by the project owner in the SQL Editor (see PROJECT_STATUS.md).
--  * public.feedback / feedback_dev_notes: RLS on, no access for anon, DEV-only read.
--  * Submissions go through submit_feedback(), executable by service_role only
--    (the Next.js server, after validation + rate limiting). Clients cannot
--    insert rows directly.
--  * DEV reads through RLS (dev_list_feedback is SECURITY INVOKER) and writes
--    through dev_update_feedback (SECURITY DEFINER with an explicit is_developer() check).
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- DEV role
-- ---------------------------------------------------------------------
create table if not exists public.developers (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  granted_at  timestamptz not null default now(),
  note        text check (note is null or char_length(note) <= 200)
);
alter table public.developers enable row level security;
revoke all on public.developers from anon, authenticated;
-- No policies: only the SQL Editor / service_role can read or change it.

create or replace function public.is_developer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.developers d where d.user_id = (select auth.uid()));
$$;
revoke all on function public.is_developer() from public, anon;
grant execute on function public.is_developer() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- feedback
-- ---------------------------------------------------------------------
create table if not exists public.feedback (
  id               uuid primary key default gen_random_uuid(),
  category         text not null check (category in ('bug', 'feature', 'general', 'other')),
  subject          text not null check (char_length(btrim(subject)) between 3 and 120),
  description      text not null check (char_length(btrim(description)) between 10 and 4000),
  page_url         text check (page_url is null or char_length(page_url) <= 500),
  status           text not null default 'pending' check (status in ('pending', 'reviewing', 'resolved', 'rejected')),
  -- Set by the server from the verified session, never from the request body.
  user_id          uuid references auth.users (id) on delete set null,
  submitter_name   text check (submitter_name is null or char_length(submitter_name) <= 64),
  submitter_email  text check (submitter_email is null or char_length(submitter_email) <= 254),
  -- HMAC of the client IP (server secret); used only for rate limiting. Never readable by clients.
  ip_hash          text check (ip_hash is null or char_length(ip_hash) <= 64),
  user_agent       text check (user_agent is null or char_length(user_agent) <= 300),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  reviewed_by      uuid references auth.users (id) on delete set null,
  reviewed_at      timestamptz
);

create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_status_created_idx on public.feedback (status, created_at desc);
create index if not exists feedback_category_created_idx on public.feedback (category, created_at desc);
create index if not exists feedback_user_created_idx on public.feedback (user_id, created_at desc) where user_id is not null;
create index if not exists feedback_ip_created_idx on public.feedback (ip_hash, created_at desc) where ip_hash is not null;
create index if not exists feedback_subject_trgm_idx on public.feedback using gin (subject extensions.gin_trgm_ops);
create index if not exists feedback_description_trgm_idx on public.feedback using gin (description extensions.gin_trgm_ops);

-- Internal developer notes live in their own table so no user-facing query can ever join them.
create table if not exists public.feedback_dev_notes (
  feedback_id  uuid primary key references public.feedback (id) on delete cascade,
  note         text not null check (char_length(note) <= 4000),
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now()
);

alter table public.feedback           enable row level security;
alter table public.feedback_dev_notes enable row level security;

revoke all on public.feedback, public.feedback_dev_notes from anon, authenticated;
-- DEV may read everything except ip_hash; all writes go through the functions below.
grant select (id, category, subject, description, page_url, status, user_id, submitter_name,
              submitter_email, user_agent, created_at, updated_at, reviewed_by, reviewed_at)
  on public.feedback to authenticated;
grant select on public.feedback_dev_notes to authenticated;

drop policy if exists feedback_dev_select on public.feedback;
create policy feedback_dev_select on public.feedback for select to authenticated
  using ((select public.is_developer()));

drop policy if exists feedback_notes_dev_select on public.feedback_dev_notes;
create policy feedback_notes_dev_select on public.feedback_dev_notes for select to authenticated
  using ((select public.is_developer()));

-- ---------------------------------------------------------------------
-- submit_feedback — service_role only. The server has already validated
-- the input; the database re-validates and rate-limits (durable across
-- server processes): 3 per 10 minutes and 15 per day per account / IP hash.
-- ---------------------------------------------------------------------
create or replace function public.submit_feedback(
  p_category text,
  p_subject text,
  p_description text,
  p_page_url text,
  p_user_id uuid,
  p_submitter_name text,
  p_submitter_email text,
  p_ip_hash text,
  p_user_agent text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_recent int;
  v_day int;
begin
  if p_category is null or p_category not in ('bug', 'feature', 'general', 'other') then
    raise exception 'INVALID_BODY: Choose a valid category.';
  end if;
  if char_length(btrim(coalesce(p_subject, ''))) not between 3 and 120 then
    raise exception 'INVALID_BODY: The subject must be 3–120 characters.';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) not between 10 and 4000 then
    raise exception 'INVALID_BODY: The description must be 10–4000 characters.';
  end if;
  if p_user_id is null and p_ip_hash is null then
    raise exception 'RATE_LIMITED: Could not identify the sender.';
  end if;

  select count(*) filter (where created_at > now() - interval '10 minutes'),
         count(*) filter (where created_at > now() - interval '1 day')
    into v_recent, v_day
    from public.feedback
   where created_at > now() - interval '1 day'
     and ((p_user_id is not null and user_id = p_user_id)
          or (p_ip_hash is not null and ip_hash = p_ip_hash));
  if v_recent >= 3 or v_day >= 15 then
    raise exception 'RATE_LIMITED: You have sent a lot of feedback recently. Please try again later.';
  end if;

  -- Same sender, same text within the last day: treat as a duplicate click.
  if exists (
    select 1 from public.feedback f
     where f.created_at > now() - interval '1 day'
       and f.subject = btrim(p_subject) and f.description = btrim(p_description)
       and ((p_user_id is not null and f.user_id = p_user_id) or (p_ip_hash is not null and f.ip_hash = p_ip_hash))
  ) then
    raise exception 'FEEDBACK_DUPLICATE: This feedback was already sent.';
  end if;

  insert into public.feedback (category, subject, description, page_url, user_id, submitter_name, submitter_email, ip_hash, user_agent)
  values (p_category, btrim(p_subject), btrim(p_description), left(p_page_url, 500), p_user_id,
          left(p_submitter_name, 64), left(p_submitter_email, 254), p_ip_hash, left(p_user_agent, 300))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_feedback(text, text, text, text, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_feedback(text, text, text, text, uuid, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------
-- dev_list_feedback — SECURITY INVOKER: the RLS policy above decides what
-- rows exist for the caller, so a non-DEV always gets zero rows (and an
-- explicit error). Search text is a bound parameter (no filter injection).
-- ---------------------------------------------------------------------
create or replace function public.dev_list_feedback(
  p_search text default null,
  p_category text default null,
  p_status text default null,
  p_sort text default 'newest',
  p_limit int default 20,
  p_offset int default 0
) returns table (
  id uuid, category text, subject text, description text, page_url text, status text,
  user_id uuid, submitter_name text, submitter_email text, user_agent text,
  created_at timestamptz, updated_at timestamptz, reviewed_at timestamptz,
  dev_note text, dev_note_updated_at timestamptz, total_count bigint
)
language plpgsql
stable
security invoker
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
    select f.id, f.category, f.subject, f.description, f.page_url, f.status,
           f.user_id, f.submitter_name, f.submitter_email, f.user_agent,
           f.created_at, f.updated_at, f.reviewed_at,
           n.note, n.updated_at, count(*) over ()
      from public.feedback f
      left join public.feedback_dev_notes n on n.feedback_id = f.id
     where (p_category is null or f.category = p_category)
       and (p_status is null or f.status = p_status)
       and (v_pat is null or f.subject ilike v_pat or f.description ilike v_pat)
     order by case when p_sort = 'oldest' then f.created_at end asc,
              case when p_sort <> 'oldest' then f.created_at end desc
     limit greatest(1, least(coalesce(p_limit, 20), 50))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.dev_list_feedback(text, text, text, text, int, int) from public, anon;
grant execute on function public.dev_list_feedback(text, text, text, text, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- dev_update_feedback — DEV only. Status and/or internal note; a null
-- argument leaves that part unchanged, an empty note removes it.
-- ---------------------------------------------------------------------
create or replace function public.dev_update_feedback(
  p_id uuid,
  p_status text default null,
  p_note text default null
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
  if p_status is not null and p_status not in ('pending', 'reviewing', 'resolved', 'rejected') then
    raise exception 'INVALID_BODY: Invalid status.';
  end if;
  if p_note is not null and char_length(p_note) > 4000 then
    raise exception 'INVALID_BODY: The note is too long (max 4000 characters).';
  end if;
  if not exists (select 1 from public.feedback where id = p_id) then
    raise exception 'NOT_FOUND: Feedback not found.';
  end if;

  if p_status is not null then
    update public.feedback
       set status = p_status, updated_at = now(), reviewed_by = v_uid, reviewed_at = now()
     where id = p_id;
  end if;

  if p_note is not null then
    if btrim(p_note) = '' then
      delete from public.feedback_dev_notes where feedback_id = p_id;
    else
      insert into public.feedback_dev_notes (feedback_id, note, updated_by, updated_at)
      values (p_id, btrim(p_note), v_uid, now())
      on conflict (feedback_id) do update
        set note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
    end if;
    update public.feedback set updated_at = now() where id = p_id;
  end if;
end;
$$;
revoke all on function public.dev_update_feedback(uuid, text, text) from public, anon;
grant execute on function public.dev_update_feedback(uuid, text, text) to authenticated;
