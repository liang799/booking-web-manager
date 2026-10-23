-- UC2-01 / UC2-03a: invalidate public discovery without exposing session rows.
-- No browser table grants, publication changes, domain rules, or network calls.
-- Rollback: drop trigger sessions_discovery_invalidation on public.sessions;
--           drop function public.broadcast_discovery_invalidation();
begin;

create function public.broadcast_discovery_invalidation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  was_listed boolean := false;
  is_listed boolean := false;
begin
  if TG_OP <> 'INSERT' then
    was_listed := OLD.visibility = 'PUBLIC' and OLD.status = 'OPEN'
      and OLD.start_at > statement_timestamp();
  end if;
  if TG_OP <> 'DELETE' then
    is_listed := NEW.visibility = 'PUBLIC' and NEW.status = 'OPEN'
      and NEW.start_at > statement_timestamp();
  end if;
  if not (was_listed or is_listed) then
    return null;
  end if;
  if TG_OP = 'UPDATE' then
    if row(OLD.session_id, OLD.visibility, OLD.status, OLD.venue_name, OLD.sport,
           OLD.region, OLD.start_at, OLD.end_at, OLD.total_slots, OLD.booking_share_cents)
       is not distinct from
       row(NEW.session_id, NEW.visibility, NEW.status, NEW.venue_name, NEW.sport,
           NEW.region, NEW.start_at, NEW.end_at, NEW.total_slots, NEW.booking_share_cents) then
      return null;
    end if;
  end if;

  -- PostgreSQL-only deployments may have no Realtime schema. They remain supported.
  -- Supabase's send writes transactionally to realtime.messages, not an HTTP API.
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    begin
      -- Public discovery includes signed-out visitors. Send no session IDs, rows, tokens,
      -- old/new values or participant/money details, even when hiding a session.
      perform realtime.send('{}'::jsonb, 'invalidate', 'discovery:public:v1', false);
    exception when others then
      -- A notification failure must not roll back an otherwise valid booking.
      -- Slow client reconciliation repairs missed hints; never log row values.
      raise warning 'Discovery invalidation unavailable (SQLSTATE %)', SQLSTATE;
    end;
  end if;
  return null;
end;
$$;

revoke all on function public.broadcast_discovery_invalidation() from public, anon, authenticated;

create trigger sessions_discovery_invalidation
  after insert or delete or update of session_id, visibility, status, venue_name,
    sport, region, start_at, end_at, total_slots, booking_share_cents
  on public.sessions
  for each row execute function public.broadcast_discovery_invalidation();

commit;
