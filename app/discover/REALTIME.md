# Discovery invalidation with Supabase Realtime

UC2-01 / UC2-03a. This replaces the original one-second polling strategy.

## Boundaries

The domain, use cases, database reader, HTTP endpoint, query parameters and
listing JSON are unchanged. Successful discovery responses add `X-Server-Time`
clock metadata as a header. The URL owns committed filters/cursors; the controller
owns the displayed outcome, seeded from server props and replaced by validated
API results for that query. The mounted form owns unsubmitted drafts. This is a
controlled page outcome, with no client query cache or React Query migration.

`public.sessions` trigger -> Supabase Broadcast -> infrastructure subscription ->
app refresh scheduler -> `GET /api/sessions` with the committed query -> existing
`DiscoverSessions.searchPublic` -> existing public projection -> controller outcome.
Initial page rendering continues through `loadDiscoveryScreen` and the same use
case. Filtering and pagination remain server responsibilities.

Background reads use an explicit fetch Promise. Local production-build testing
with the installed Next 15.5 runtime reproduced a `router.refresh()` transition
remaining pending after the streamed response completed. The symptom matches
[Next.js issue #86055](https://github.com/vercel/next.js/issues/86055). A scheduler
that waited for that transition could block later invalidations indefinitely.
The request's settlement now releases the in-flight state, and teardown aborts
the request and ignores stale completion. This avoids relying on framework
transition completion for background network work without patching the framework.

The new database trigger is a persistence notification adapter, not a business
workflow. `realtime.send` writes a transactional database message; it makes no
external network call inside the booking transaction. Rollback also rolls back
the notification. A failed notification must not fail the booking itself.

## Privacy and anonymous browsing

Migration `0015_discovery_realtime.sql` passes `{}` to `realtime.send` on the public
topic `discovery:public:v1`, event `invalidate`. Supabase adds a generated broadcast
UUID as transport metadata, including `payload.id` on the current runtime. This is
not a session ID. The notification never sends the old/new row, session IDs,
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

Events coalesce over 250 ms. An initial catch-up read and another invalidation on
subscription acknowledgement cover changes around page loading and connection.
In-flight reads never overlap; an event during a
read or foreground navigation remains pending for a subsequent refresh. Sustained
events do not keep resetting the debounce window. Existing error presentation,
foreground loading, URL history, drafts, focus, scroll and cursor behavior remain.
The displayed outcome is updated only while the request still belongs to the
mounted controller and committed query.

Hidden/offline pages unsubscribe and catch up on return. Channel failures retry
with exponential backoff (one to thirty seconds); disposal cancels pending retries
and ignores late callbacks. Only this adapter's dedicated client is disconnected.

A 30-second reconciliation timer repairs missed events and supports deployments
without Realtime settings or service availability. At idle this is about two
background reads per minute instead of sixty, plus connection/resume reads.
A separate timer refreshes at the first displayed session's start time because
clock-driven expiry does not generate a database change. Initial rendering
supplies the start and current server time as page metadata; later successful
API reads supply `X-Server-Time` in Unix milliseconds. The browser schedules the
remaining duration using its monotonic clock. Refresh throttling uses the same
monotonic clock, so changing the device's wall clock does not delay events or
expiry. A response still containing an expired session rearms a bounded retry.
The clock header is additive; the public discovery JSON projection is unchanged.

The existing three-second visibility target applies to a healthy visible online
page with Realtime configured and delivering events. The 30-second degraded-mode
fallback does NOT satisfy that target. Delivery plus database/render latency
must be verified in the deployment; the debounce interval is not a latency SLA.
In particular, a channel's `SUBSCRIBED` acknowledgement does not prove that a cold
database broadcast stream is ready. Missed startup events rely on reconciliation.

## Deployment

1. Review and apply migration 0015 through the normal migration workflow before
   relying on Realtime freshness. Coordinate the sequence with Rishi before merge.
2. Supply the existing `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` at build time. Never expose a service-role key.
3. Enable Supabase Realtime and allow public channels for the invalidation topic.
   No `sessions` publication or SELECT grant is required. Do not disable private
   channel authorization for unrelated features.
4. Verify in two browsers, including a signed-out Discover visitor: publish, hide
   and cancel a session; check appearance/disappearance within three seconds and
   inspect the broadcast to confirm it contains only generated broadcast metadata,
   with no session IDs, tokens, rows or participant information.
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
visibility/connectivity, expiry across clock skew and wall-clock changes, cleanup,
adapter retries and optional settings. API tests verify the response-time clock
header and unchanged success/error JSON; client/controller tests cover background
response validation, explicit request completion and stale-response cleanup.
`tests/integration/discovery-realtime.test.ts` uses the actual disposable Realtime
service to verify anonymous delivery, private/past/closed exclusions, unchanged
writes, rollback, payload privacy and retained table restrictions. Before running
tests, the guarded disposable runner repeatedly sends a synthetic nonce through
the database on a unique public test topic until an anonymous client receives it.
It retains that connection through the test run, including builds, and disposes
it during cleanup. This establishes actual delivery readiness instead of assuming
that `SUBSCRIBED` means the database stream is ready. No real session data is used
by this probe. The integration runner enables Realtime without weakening the
three-second browser assertions.

Run:

```sh
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:e2e:integration
```

Anonymous browser tests verify publish/hide delivery and session expiry with the
browser clock ahead or behind the server. Existing visibility/cancellation browser
tests and the background-refresh Storybook story remain regression coverage.
Delayed-refresh and teardown tests explicitly mutate the public projection to
exercise invalidations. These tests need the disposable local
stack; do not run them against a hosted or production project.

## Deliberately unchanged

No changes to SQL pagination, domain authorization, wallet/booking mutations,
HTTP query/body schemas, component markup, shared UI, CSS, images or design revisions.
The HTTP addition is the successful-response `X-Server-Time` header described above.
The existing all-matches discovery query is still a separate scalability concern.
