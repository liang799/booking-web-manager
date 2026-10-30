-- 0017_group_invitations: invite a player to a regular group by user ID (UC1-06; ADR-0022).
-- A member invites someone found by their user ID; the player joins only by accepting.
-- Invitations give the same access as the group's invitation link, so they end when
-- the link is turned off or the group is archived, and when the player joins.
-- Needs 0005, 0010 and 0016.
--
-- Deploy: apply this migration with the app that sends invitations. The previous app
-- keeps working, because save_regular_group's two new parameters default to "no
-- change", and this function still clears invitations the old app's saves end
-- (joining, turning the link off, archiving).
-- Rollback (manual, in this order):
--   drop function public.save_regular_group(uuid, uuid, text, text, boolean, text, integer, jsonb, uuid[], jsonb, uuid[]);
--   recreate save_regular_group(uuid, uuid, text, text, boolean, text, integer, jsonb, uuid[]) from 0010;
--   drop table public.group_invitations;
-- Dropping the table loses every unanswered invitation; memberships are unaffected.

begin;

-- ---------------------------------------------------------------------------
-- 1. Unanswered invitations
-- ---------------------------------------------------------------------------

create table public.group_invitations (
  group_id uuid not null references public.regular_groups(group_id) on delete restrict,
  invitee_id uuid not null references public.profiles(user_id) on delete restrict,
  invited_by uuid not null references public.profiles(user_id) on delete restrict,
  invited_at timestamptz not null,
  primary key (group_id, invitee_id),
  check (invitee_id <> invited_by)
);
-- The invitee's Groups page lists their invitations.
create index group_invitations_invitee_idx on public.group_invitations(invitee_id, group_id);

comment on table public.group_invitations is
  'Players invited to a regular group by user ID who have not accepted or declined (GroupInvitation in domain/groups). Written only through save_regular_group.';

-- No browser access, like the other group tables (lib/supabase/group-store.ts).
alter table public.group_invitations enable row level security;
revoke all on public.group_invitations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. save_regular_group: also saves invitations in the same guarded write
-- ---------------------------------------------------------------------------

-- Replaces 0010's nine-argument version. Calls without the invitation arguments still
-- resolve here.
drop function public.save_regular_group(uuid, uuid, text, text, boolean, text, integer, jsonb, uuid[]);

create function public.save_regular_group(
  p_group_id uuid,
  p_owner_id uuid,
  p_name text,
  p_invitation_token text,
  p_invitation_active boolean,
  p_status text,
  p_expected_version integer,
  p_added_members jsonb,
  p_removed_members uuid[],
  p_added_invitations jsonb default '[]'::jsonb,  -- [{"invitee_id": "...", "invited_by": "...", "invited_at": "..."}]
  p_removed_invitations uuid[] default '{}'::uuid[]  -- invitee IDs
) returns integer
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  saved_version integer;
  account_id uuid;
  account_status text;
begin
  -- As in 0010: lock and check the owner and every newly added member. Also check
  -- both sides of every new invitation, so nobody invites or is invited from an
  -- account being deleted. Lock profiles before the group, in a stable order.
  for account_id in
    select distinct candidate.user_id
    from (
      select coalesce(
        (select owner_id from regular_groups where group_id = p_group_id),
        p_owner_id
      ) as user_id
      union all
      select (member ->> 'user_id')::uuid
      from jsonb_array_elements(coalesce(p_added_members, '[]'::jsonb)) as member
      union all
      select (invitation ->> 'invitee_id')::uuid
      from jsonb_array_elements(coalesce(p_added_invitations, '[]'::jsonb)) as invitation
      union all
      select (invitation ->> 'invited_by')::uuid
      from jsonb_array_elements(coalesce(p_added_invitations, '[]'::jsonb)) as invitation
    ) candidate
    order by candidate.user_id
  loop
    select p.account_status into account_status
      from profiles p where p.user_id = account_id for share;
    if not found then
      raise exception 'Group account % does not exist', account_id using errcode = '23503';
    end if;
    if account_status <> 'ACTIVE' then
      raise exception 'INACTIVE_ACCOUNT: group account % is inactive', account_id using errcode = 'GRP02';
    end if;
  end loop;

  if p_expected_version is null then
    insert into regular_groups (group_id, owner_id, name, invitation_token, invitation_active, status, version)
    values (p_group_id, p_owner_id, p_name, p_invitation_token, p_invitation_active, p_status, 0);
    saved_version := 0;
  else
    update regular_groups
       set name = p_name,
           invitation_token = p_invitation_token,
           invitation_active = p_invitation_active,
           status = p_status,
           version = version + 1
     where group_id = p_group_id
       and version = p_expected_version
    returning version into saved_version;

    if not found then
      raise exception 'GROUP_CHANGED: group % was changed by someone else', p_group_id
        using errcode = '40001';
    end if;
  end if;

  -- Keep 0005's archive/session lock protocol and optimistic version check.
  if p_status = 'ARCHIVED' and public.count_unsettled_linked_sessions(p_group_id) > 0 then
    raise exception 'ACTIVE_OBLIGATIONS: group % has unsettled linked sessions', p_group_id
      using errcode = 'GRP01';
  end if;

  insert into group_memberships (group_id, user_id, joined_at)
  select p_group_id, (member ->> 'user_id')::uuid, (member ->> 'joined_at')::timestamptz
    from jsonb_array_elements(coalesce(p_added_members, '[]'::jsonb)) as member;

  delete from group_memberships
   where group_id = p_group_id
     and user_id = any(coalesce(p_removed_members, '{}'::uuid[]));

  delete from group_invitations
   where group_id = p_group_id
     and invitee_id = any(coalesce(p_removed_invitations, '{}'::uuid[]));

  insert into group_invitations (group_id, invitee_id, invited_by, invited_at)
  select p_group_id, (invitation ->> 'invitee_id')::uuid, (invitation ->> 'invited_by')::uuid,
         (invitation ->> 'invited_at')::timestamptz
    from jsonb_array_elements(coalesce(p_added_invitations, '[]'::jsonb)) as invitation;

  -- RegularGroup's rules, kept here too for saves from the app version before 0017:
  -- invitations end with the link or the group, and a member is never also invited.
  delete from group_invitations invitation
   where invitation.group_id = p_group_id
     and (p_status <> 'ACTIVE'
          or not p_invitation_active
          or exists (select 1 from group_memberships member
                      where member.group_id = invitation.group_id
                        and member.user_id = invitation.invitee_id));

  return saved_version;
end;
$fn$;

revoke execute on function public.save_regular_group(uuid, uuid, text, text, boolean, text, integer, jsonb, uuid[], jsonb, uuid[])
  from public, anon, authenticated;
grant execute on function public.save_regular_group(uuid, uuid, text, text, boolean, text, integer, jsonb, uuid[], jsonb, uuid[])
  to service_role;

commit;
