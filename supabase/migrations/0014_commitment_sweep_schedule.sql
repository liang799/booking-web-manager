-- UC2-05/06: run the scheduled commitment sweep every five minutes.
--
-- pg_cron calls request_commitment_sweep(), which uses pg_net to send
-- GET /api/cron/commitments with `Authorization: Bearer <CRON_SECRET>`. The
-- route does the work (forfeiture at start, waitlist promotion, 72h
-- auto-verification); this migration only supplies the clock.
--
-- The URL and secret are read from Supabase Vault at call time, so neither is
-- in git. Until both exist the job runs and does nothing:
--
--   select vault.create_secret(
--     'https://<deployment>/api/cron/commitments', 'commitment_sweep_url');
--   select vault.create_secret('<CRON_SECRET from Vercel>', 'cron_secret');
--
-- See app/commit/README.md#scheduled-jobs.
begin;

create or replace function public.request_commitment_sweep()
returns bigint
language plpgsql
set search_path = ''
as $fn$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'commitment_sweep_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_secret';

  if v_url is null or v_secret is null then
    raise notice
      'Commitment sweep not requested: set the commitment_sweep_url and cron_secret Vault secrets.';
    return null;
  end if;

  -- Asynchronous: pg_net sends the request after this transaction commits and
  -- records the reply in net._http_response. The timeout matches the route's
  -- maxDuration.
  return net.http_get(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000
  );
end;
$fn$;

comment on function public.request_commitment_sweep() is
  'Requests GET /api/cron/commitments with the Vault cron secret. Scheduled every five minutes via pg_cron.';

-- Functions in public are callable through the Data API by default. Only the
-- scheduler may call this one.
revoke all on function public.request_commitment_sweep() from public, anon, authenticated;

-- Guarded like 0002's reconciliation job: pg_cron and pg_net are not present
-- on every local Postgres, and a migration that cannot apply is worse than a
-- job that must be scheduled by hand.
do $cron$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice
      'pg_cron or pg_net unavailable; call GET /api/cron/commitments externally.';
    return;
  end if;

  create extension if not exists pg_net;
  create extension if not exists pg_cron;

  -- Same name replaces the job, so reapplying keeps a single schedule.
  perform cron.schedule(
    'commitment-sweep-every-5-minutes',
    '*/5 * * * *',
    'select public.request_commitment_sweep();'
  );
exception
  when others then
    raise notice
      'Could not schedule the commitment sweep (%). Call GET /api/cron/commitments every five minutes externally.',
      sqlerrm;
end;
$cron$;

commit;

-- Rollback:
--   select cron.unschedule('commitment-sweep-every-5-minutes');
--   drop function public.request_commitment_sweep();
