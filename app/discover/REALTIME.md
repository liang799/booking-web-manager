# Discovery invalidation with Supabase Realtime

UC2-01 / UC2-03a. This replaces the original one-second polling strategy.

## Boundaries

The domain, use cases, database reader, HTTP endpoint and public response contract
are unchanged. The URL still owns committed filters/cursors; server props own
results; the mounted form owns unsubmitted drafts. There is no second client-side
copy of the discovery result and no React Query migration in this change.

`public.sessions` trigger -> Supabase Broadcast -> infrastructure subscription ->
app refresh scheduler -> `router.refresh()` -> existing `loadDiscoveryScreen` ->
`DiscoverSessions.searchPublic` -> existing public projection.

The new database trigger is a persistence notification adapter, not a business
workflow. `realtime.send` writes a transactional database message; it makes no
external network call inside the booking transaction. Rollback also rolls back
the notification. A failed notification must not fail the booking itself.

## Privacy and anonymous browsing

Migration `0015_discovery_realtime.sql` emits `{}` on the public topic
`discovery:public:v1`, event `invalidate`. It never sends the old/new row, IDs,
room tokens, booker/participant identities or financial records. There are no new
browser table grants, RLS relaxations or Postgres Changes publications.

Only inserts/deletes/changes affecting an upcoming public open session's listing
projection emit an event. Public-to-private and cancellation transitions notify
using the previous public visibility. Private-only edits, already-started/closed
sessions and writes that leave the public projection unchanged do not notify.
Discovery shows total capacity, not live available places; participant-only
updates do not change its contract and must not trigger unrelated discovery reads.

Public Broadcast deliberately permits signed-out visitors. Public channel
messages can also be sent by other clients: treat all of them as untrusted
invalidation hints, never as authoritative data. Refreshes are coalesced and
limited to at most one per second per page, regardless of event frequency.
This client-side cap is not a replacement for server-side traffic protection.
The dedicated client has session persistence and token refresh disabled, so
optional authentication cannot block the notification subscription.

## Timing and lifecycle

Events coalesce over 250 ms, including subscription acknowledgement to close the
initial-read/subscribe race. In-flight refreshes never overlap; an event during a
read or foreground navigation remains pending for a subsequent refresh. Sustained
events do not keep resetting the debounce window. Existing error presentation,
foreground loading, URL history, drafts, focus, scroll and cursor behavior remain.

Hidden/offline pages unsubscribe and catch up on return. Channel failures retry
with exponential backoff (one to thirty seconds); disposal cancels pending retries
and ignores late callbacks. Only this adapter's dedicated client is disconnected.

A 30-second reconciliation timer repairs missed events and supports deployments
without Realtime settings or service availability. At idle this is about two
background reads per minute instead of sixty, plus connection/resume reads.
A separate timer refreshes at the first displayed session's start time because
clock-driven expiry does not generate a database change.

The existing three-second visibility target applies to a healthy visible online
page with Realtime configured and delivering events. The 30-second degraded-mode
fallback does NOT satisfy that target. Delivery plus database/render latency
must be verified in the deployment; the debounce interval is not a latency SLA.

## Deployment

1. Review and apply migration 0015 through the normal migration workflow before
   relying on Realtime freshness. Coordinate the sequence with Rishi before merge.
2. Supply the existing `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` at build time. Never expose a service-role key.
3. Enable Supabase Realtime and allow public channels for the payload-free topic.
   No `sessions` publication or SELECT grant is required. Do not disable private
   channel authorization for unrelated features.
4. Verify in two browsers, including a signed-out Discover visitor: publish, hide
   and cancel a session; check appearance/disappearance within three seconds and
   inspect the broadcast to confirm its payload is empty.
5. Disconnect Realtime, verify slower reconciliation, then reconnect. Check hidden
   tabs, pending filter edits and navigation away for cleanup and state preservation.

The migration safely skips sending on PostgreSQL-only installations without
`realtime.send`. Browser reads remain available with only `DATABASE_URL`.

## Rollback

To disable only the notification producer, use a reviewed follow-up migration:

```sql
drop trigger if exists sessions_discovery_invalidation on public.sessions;
drop function if exists public.broadcast_discovery_invalidation();
```

Do not remove an already-applied migration from the shared migration history.
The client continues to reconcile every 30 seconds. Reverting the application
commit also restores the previous one-second polling behavior; it does not
require changing session data or permissions.

## Validation

Unit tests cover scheduler coalescing, in-flight invalidations, navigation guards,
visibility/connectivity, expiry, cleanup, adapter retries and optional settings.
`tests/integration/discovery-realtime.test.ts` uses the actual disposable Realtime
service to verify anonymous delivery, private/past/closed exclusions, unchanged
writes, rollback, payload privacy and retained table restrictions. The integration
runner now enables Realtime instead of weakening three-second browser assertions.

Run:

```sh
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:e2e:integration
```

Existing visibility/cancellation browser tests and the background-refresh
Storybook story remain regression coverage. These tests need the disposable local
stack; do not run them against a hosted or production project.

## Deliberately unchanged

No changes to SQL pagination, domain authorization, wallet/booking mutations,
HTTP contracts, component markup, shared UI, CSS, images or design revisions.
The existing all-matches discovery query is still a separate scalability concern.
