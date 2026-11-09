-- =====================================================================
-- AION 2 Guild Command — 0013 DEV: delete a user account
--
-- dev_delete_user(p_user_id, p_confirm_email) — DEV only, one transaction.
--
--   * Guild Leader  → the guild they lead is deleted with everything in it
--                     (roster, snapshots, presets, settings, secrets, audit log,
--                     memberships, refresh state, join attempts). The other
--                     members are notified first and end up without a guild.
--   * Guild Member  → their character is removed from the guild roster and
--                     their membership ends; the guild stays. The leader and the
--                     other members are notified.
--   * Then the Auth user is deleted. That cascades to the profile, the character
--     ownership (the character becomes claimable again), join attempts,
--     suspension, notification reads and notifications addressed to the user.
--     Feedback is kept (its user_id is set to null).
--
-- Refused for: yourself, DEV accounts, unknown ids, a wrong confirmation e-mail.
-- The leader row cannot be deleted while its guild exists (membership trigger),
-- so the guild is removed first — that is why this is a function and not a
-- plain "delete from auth.users".
--
-- Storage objects (guild image) cannot be removed from SQL; the route handler
-- removes "<guild id>/…" from the "guild-images" bucket afterwards.
-- Returns { guild_id, guild_deleted } (guild_id null when the user had no guild).
--
-- Safe to run twice. Depends on 0001, 0002, 0008, 0009, 0011.
-- =====================================================================

create or replace function public.dev_delete_user(
  p_user_id uuid,
  p_confirm_email text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_guild uuid;
  v_role public.guild_role;
  v_name text;
  v_deleted boolean := false;
begin
  if v_uid is null or not exists (select 1 from public.developers d where d.user_id = v_uid) then
    raise exception 'FORBIDDEN: Developer access required.';
  end if;
  if p_user_id is null then
    raise exception 'INVALID_BODY: Missing user id.';
  end if;
  if p_user_id = v_uid then
    raise exception 'INVALID_BODY: You cannot delete your own account.';
  end if;
  if exists (select 1 from public.developers d where d.user_id = p_user_id) then
    raise exception 'INVALID_BODY: Developer accounts cannot be deleted here.';
  end if;

  select u.email::text into v_email from auth.users u where u.id = p_user_id;
  if not found then
    raise exception 'NOT_FOUND: User not found.';
  end if;
  if v_email is not null and lower(btrim(coalesce(p_confirm_email, ''))) <> lower(v_email) then
    raise exception 'INVALID_BODY: The confirmation e-mail does not match.';
  end if;

  -- The guild the user belongs to; a guild they lead counts even if the membership row is missing.
  select m.guild_id, m.role into v_guild, v_role from public.guild_memberships m where m.user_id = p_user_id;
  if v_guild is null then
    select g.id into v_guild from public.guilds g where g.leader_user_id = p_user_id;
    if v_guild is not null then v_role := 'leader'; end if;
  end if;

  if v_guild is not null then
    -- Serialize with leave / transfer / join on the same guild.
    perform 1 from public.guilds g where g.id = v_guild for update;

    select coalesce(c.character_name, p.display_name, 'สมาชิก')
      into v_name
      from public.profiles p
      left join public.character_ownerships o on o.user_id = p.id
      left join public.characters c on c.id = o.character_id
     where p.id = p_user_id;

    if v_role = 'leader' then
      insert into public.notifications (kind, title, body, audience, recipient_user_id, created_by)
      select 'guild', 'กิลด์ถูกลบ',
             format('กิลด์ถูกลบเนื่องจากบัญชีของหัวหน้ากิลด์ (%s) ถูกลบ คุณสามารถสร้างหรือเข้าร่วมกิลด์ใหม่ได้', coalesce(v_name, 'หัวหน้ากิลด์')),
             array['member'], m.user_id, v_uid
        from public.guild_memberships m
       where m.guild_id = v_guild and m.user_id <> p_user_id;

      -- Cascades: memberships, roster (+ snapshots, equipment), presets (+ slots), settings,
      -- secrets, audit log, refresh state, join attempts.
      delete from public.guilds where id = v_guild;
      v_deleted := true;
    else
      insert into public.notifications (kind, title, body, audience, recipient_user_id, created_by)
      select 'guild', 'สมาชิกออกจากกิลด์',
             format('%s ได้ออกจากกิลด์แล้ว', v_name),
             array['member'], m.user_id, v_uid
        from public.guild_memberships m
       where m.guild_id = v_guild and m.user_id <> p_user_id;

      perform public.write_audit(v_guild, 'guild.member_deleted', jsonb_build_object('user_id', p_user_id));

      -- The roster entry must go (character_id is unique across guilds); the roster
      -- triggers also end the membership, the explicit delete covers accounts without a character.
      delete from public.guild_roster_members r
       where r.guild_id = v_guild
         and r.character_id in (select o.character_id from public.character_ownerships o where o.user_id = p_user_id);
      delete from public.guild_memberships where user_id = p_user_id and guild_id = v_guild;
    end if;
  end if;

  -- Cascades to profiles → ownerships, join attempts; suspension; notification rows/reads.
  delete from auth.users where id = p_user_id;

  return jsonb_build_object('guild_id', v_guild, 'guild_deleted', v_deleted);
end;
$$;
revoke all on function public.dev_delete_user(uuid, text) from public, anon;
grant execute on function public.dev_delete_user(uuid, text) to authenticated;
