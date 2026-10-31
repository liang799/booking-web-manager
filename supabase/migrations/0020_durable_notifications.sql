-- Canonical, transactionally written inbox plus short-lived per-subscription delivery work.
-- read_at and its index intentionally remain during the application cutover.
begin;

alter table public.notification_inbox
  add column kind text,
  add column session_id uuid,
  add column group_id uuid,
  add column expires_at timestamptz;
create index notification_inbox_retention on public.notification_inbox(created_at);

create table public.notification_push_jobs (
  notification_id uuid not null references public.notification_inbox(id) on delete cascade,
  endpoint text not null references public.push_subscriptions(endpoint) on delete cascade,
  subscription_created_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  expires_at timestamptz not null,
  lease_until timestamptz,
  lease_token uuid,
  primary key(notification_id, endpoint)
);
create index notification_push_jobs_due on public.notification_push_jobs(next_attempt_at);
alter table public.notification_push_jobs enable row level security;
revoke all on public.notification_push_jobs from public, anon, authenticated;
grant all on public.notification_push_jobs to service_role;

-- All calls use the caller's existing business transaction; no HTTP occurs here.
create function public.append_notifications(p_notifications jsonb)
returns table(recipient_id uuid)
language plpgsql
set search_path = ''
as $fn$
declare item jsonb; inserted_id uuid; inserted_recipient uuid; deadline timestamptz;
begin
  for item in select value from jsonb_array_elements(coalesce(p_notifications, '[]'::jsonb)) loop
    insert into public.notification_inbox(recipient_id,source_key,category,title,body,destination,kind,session_id,group_id,expires_at)
    select p.user_id,item->>'source_key',item->>'category',item->>'title',item->>'body',item->>'destination',item->>'kind',
      (item->>'session_id')::uuid,(item->>'group_id')::uuid,(item->>'expires_at')::timestamptz
    from public.profiles p where p.user_id=(item->>'recipient_id')::uuid and p.account_status='ACTIVE'
    on conflict on constraint notification_inbox_recipient_id_source_key_key do nothing
    returning id,notification_inbox.recipient_id into inserted_id,inserted_recipient;
    if inserted_id is null then continue; end if;
    -- The newest actionable occurrence supersedes older pending device work;
    -- canonical inbox history remains, including a declined-and-reissued invitation.
    if item->>'kind' in ('GROUP_INVITATION','REPLACEMENT_INVITATION','PROMOTED','REMOVED_FROM_WAITLIST','GROUP_MEMBER_REMOVED','FORFEITURE_WARNING') then
      delete from public.notification_push_jobs j using public.notification_inbox old
       where old.id=j.notification_id and old.id<>inserted_id and old.recipient_id=inserted_recipient
         and old.kind=item->>'kind' and old.session_id is not distinct from (item->>'session_id')::uuid
         and old.group_id is not distinct from (item->>'group_id')::uuid;
    end if;
    if item->>'kind' in ('BOOKING_JOINED','WAITLIST_ENTERED') then
      delete from public.notification_push_jobs j using public.notification_inbox old
       where old.id=j.notification_id and old.recipient_id=inserted_recipient
         and old.session_id=(item->>'session_id')::uuid and old.kind in ('PROMOTED','REMOVED_FROM_WAITLIST');
    end if;
    if coalesce((item->>'push_enabled')::boolean,false) then
      deadline := least(clock_timestamp()+interval '24 hours',coalesce((item->>'expires_at')::timestamptz,'infinity'::timestamptz));
      insert into public.notification_push_jobs(notification_id,endpoint,subscription_created_at,expires_at)
      select inserted_id,s.endpoint,s.created_at,deadline from public.push_subscriptions s where s.user_id=inserted_recipient;
    end if;
    recipient_id := inserted_recipient;
    return next;
  end loop;
end;
$fn$;
revoke all on function public.append_notifications(jsonb) from public,anon,authenticated;
grant execute on function public.append_notifications(jsonb) to service_role;

-- Preserve the old integer result and optional invitation arguments. The old body
-- still owns every account, optimistic-version and archive/session guard.
alter function public.save_regular_group(uuid,uuid,text,text,boolean,text,integer,jsonb,uuid[],jsonb,uuid[]) rename to save_regular_group_v17;
create function public.save_regular_group(
  p_group_id uuid,p_owner_id uuid,p_name text,p_invitation_token text,p_invitation_active boolean,p_status text,
  p_expected_version integer,p_added_members jsonb,p_removed_members uuid[],
  p_added_invitations jsonb default '[]'::jsonb,p_removed_invitations uuid[] default '{}'::uuid[],
  p_notifications jsonb default '[]'::jsonb
) returns integer language plpgsql set search_path='' as $fn$
declare saved_version integer;
begin
  saved_version := public.save_regular_group_v17(p_group_id,p_owner_id,p_name,p_invitation_token,p_invitation_active,p_status,
    p_expected_version,p_added_members,p_removed_members,p_added_invitations,p_removed_invitations);
  perform public.append_notifications(p_notifications);
  return saved_version;
end;
$fn$;
revoke all on function public.save_regular_group(uuid,uuid,text,text,boolean,text,integer,jsonb,uuid[],jsonb,uuid[],jsonb) from public,anon,authenticated;
grant execute on function public.save_regular_group(uuid,uuid,text,text,boolean,text,integer,jsonb,uuid[],jsonb,uuid[],jsonb) to service_role;

-- Current actionability is checked again before each external delivery.
create function public.notification_push_relevant(p_kind text,p_recipient uuid,p_session uuid,p_group uuid)
returns boolean language sql stable set search_path='' as $fn$
 select case
 when p_kind='GROUP_INVITATION' then exists(select 1 from public.group_invitations i join public.regular_groups g using(group_id)
   where i.group_id=p_group and i.invitee_id=p_recipient and g.status='ACTIVE' and g.invitation_active)
 when p_kind='GROUP_MEMBER_REMOVED' then not exists(select 1 from public.group_memberships where group_id=p_group and user_id=p_recipient)
 when p_kind='GROUP_ARCHIVED' then exists(select 1 from public.regular_groups where group_id=p_group and status='ARCHIVED')
 when p_kind='BOOKING_CANCELLED' then exists(select 1 from public.sessions where session_id=p_session and status='CANCELLED')
 when p_kind='PARTICIPANT_REMOVED' then exists(select 1 from public.participations where session_id=p_session and user_id=p_recipient and status='REMOVED')
 when p_kind='GROUP_BOOKING_CREATED' then exists(select 1 from public.sessions s join public.group_memberships m on m.group_id=s.invited_group_id
   where s.session_id=p_session and s.status='OPEN' and s.start_at>now() and m.user_id=p_recipient)
 when p_kind='PROMOTED' then exists(select 1 from public.sessions s join public.participations p using(session_id)
   where s.session_id=p_session and s.status='OPEN' and s.start_at>now() and p.user_id=p_recipient and p.status='COMMITTED')
 when p_kind='REMOVED_FROM_WAITLIST' then not exists(select 1 from public.participations where session_id=p_session and user_id=p_recipient and status in ('WAITLISTED','COMMITTED'))
 when p_kind='REPLACEMENT_INVITATION' then exists(select 1 from public.participations p join public.fund_holds h using(participation_id) join public.sessions s using(session_id)
   where p.session_id=p_session and p.replacement_invitee_id=p_recipient and p.status='WITHDRAWN' and p.replacement_mode='DIRECT_INVITE'
   and h.state in ('AWAITING_REPLACEMENT','REFUNDED') and s.status='OPEN' and s.start_at>now()
   and not exists(select 1 from public.participations r where r.replaces_participation_id=p.participation_id))
 when p_kind='FORFEITURE_WARNING' then exists(select 1 from public.participations p join public.fund_holds h using(participation_id) join public.sessions s using(session_id)
   where p.session_id=p_session and p.user_id=p_recipient and h.state='AWAITING_REPLACEMENT' and s.status='OPEN' and s.start_at>now())
 when p_kind='FORFEITURE_DUE' then exists(select 1 from public.participations p join public.fund_holds h using(participation_id) join public.sessions s using(session_id)
   where p.session_id=p_session and p.user_id=p_recipient and h.state='FORFEITURE_DUE' and s.status<>'CANCELLED')
 when p_kind='VERIFICATION_REMINDER' then exists(select 1 from public.sessions s where s.session_id=p_session and s.booker_id=p_recipient and s.status='OPEN'
   and s.end_at<=now() and exists(select 1 from public.participations p where p.session_id=s.session_id and p.status='COMMITTED' and p.attendance='UNVERIFIED'))
 else p_kind in ('REPLACEMENT_ACCEPTED','REPLACEMENT_REFUNDED') end;
$fn$;
revoke all on function public.notification_push_relevant(text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.notification_push_relevant(text,uuid,uuid,uuid) to service_role;
commit;
