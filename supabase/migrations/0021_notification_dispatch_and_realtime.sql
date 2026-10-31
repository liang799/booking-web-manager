begin;
-- Broadcast authorization is namespace-specific. Restrictive guards prevent an
-- unrelated permissive policy from opening notification topics. Public discovery stays public.
do $policies$
begin
  if to_regclass('realtime.messages') is not null then
    execute $sql$create policy notification_receive_own on realtime.messages for select to authenticated
      using (extension='broadcast' and (select realtime.topic())='user:'||(select auth.uid())::text||':notifications'
        and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.account_status='ACTIVE'))$sql$;
    execute $sql$create policy notification_receive_guard on realtime.messages as restrictive for select to anon,authenticated
      using ((select realtime.topic()) not like 'user:%:notifications' or
       (extension='broadcast' and (select realtime.topic())='user:'||(select auth.uid())::text||':notifications'
        and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.account_status='ACTIVE')))$sql$;
    execute $sql$create policy notification_publish_guard on realtime.messages as restrictive for insert to anon,authenticated
      with check ((select realtime.topic()) not like 'user:%:notifications')$sql$;
  end if;
end;
$policies$;

-- One bounded delete per call; daily cron runs batches without retaining a second message history.
create function public.cleanup_notification_history(p_batch_size integer default 1000)
returns integer language plpgsql set search_path='' as $fn$
declare removed integer;
begin
  delete from public.notification_inbox where id in (
    select id from public.notification_inbox where created_at<statement_timestamp()-interval '30 days'
    order by created_at,id limit greatest(1,least(p_batch_size,10000)) for update skip locked
  );
  get diagnostics removed=row_count;
  return removed;
end;
$fn$;
revoke all on function public.cleanup_notification_history(integer) from public,anon,authenticated;
grant execute on function public.cleanup_notification_history(integer) to service_role;

create function public.request_notification_dispatch()
returns bigint language plpgsql set search_path='' as $fn$
declare v_url text;v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name='notification_dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='cron_secret';
  if v_url is null or v_secret is null then
    raise notice 'Notification dispatch requires notification_dispatch_url and cron_secret Vault entries';
    return null;
  end if;
  return net.http_get(url:=v_url,headers:=jsonb_build_object('Authorization','Bearer '||v_secret),timeout_milliseconds:=60000);
end;
$fn$;
revoke all on function public.request_notification_dispatch() from public,anon,authenticated;

do $cron$
begin
  if not exists(select 1 from pg_available_extensions where name='pg_cron')
     or not exists(select 1 from pg_available_extensions where name='pg_net') then
    raise notice 'Schedule notification dispatch every minute and cleanup daily externally';
    return;
  end if;
  create extension if not exists pg_net;
  create extension if not exists pg_cron;
  perform cron.schedule('notification-dispatch-every-minute','* * * * *','select public.request_notification_dispatch();');
  perform cron.schedule('notification-history-daily','10 19 * * *',
    'do $cleanup$ begin for batch in 1..100 loop exit when public.cleanup_notification_history(1000)=0; end loop; end; $cleanup$;');
exception when others then
  raise notice 'Notification cron unavailable; configure external dispatch and retention cleanup (%).',sqlstate;
end;
$cron$;
commit;
