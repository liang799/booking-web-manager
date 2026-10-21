# /app/sessions

**Owner:** Neoh (liang799)

`GET /api/sessions` provides UC2-01 discovery; see the
[discovery contract and page guide](../discover/README.md). Swagger documents
creation, discovery, visibility and cancellation. This guide covers creation and management.

UC2-02 supplies the Create Session API with Supabase bearer authentication and
atomic PostgreSQL persistence. When server settings are missing,
`POST /api/sessions` returns:

```json
{
  "error": {
    "code": "SESSION_API_UNAVAILABLE",
    "message": "Session creation is not available yet"
  }
}
```

The status is **503**. Valid server settings enable session creation after the
prerequisite migrations are applied. The [configuration guide](../../use-case-config/README.md)
records settings, ownership, and the dependency on PR #34 followed by migration 0006. Documentation and contract tests work
without credentials or a local Supabase stack.

## UC2-02: create-session wizard

UC2-03a visibility (PR #38) and UC2-03c cancellation (PR #41) are on `main`;
the creation wizard includes those dependencies by updating from `main`.
Apply the migration sequence in numbered order, including 0008 for custom pricing.
The wizard and pricing changes retain independent review of every affected area under the
[contribution workflow](../../docs/contributing-workflow.md).

`/sessions/create` uses a focused mobile shell and the standard desktop sidebar;
the hosted list has its own route-group layout and a create button in every state.
The three steps preserve drafts, validate before advancing, and focus the new
heading or first invalid field. The footer occupies layout space outside the
scrolling body; short screens can scroll every field fully into view.

Details start with Tennis and empty venue, dates and cost. The date dialog uses
Singapore time, with separate start/end dates for overnight bookings. Cost is
parsed directly into integer cents. Settings default to Private, eight slots,
a minimum headcount of four, and 4.5/5 reliability (90/100). Capacity is 2–30
(`domain/sessions/capacity.ts`, raised from the SRS's original 2–8 by migration
0013); minimum headcount must be between two and the selected capacity. Reliability choices are no minimum or
3–5 in half-point increments. Pricing uses the selected sport's local photo and the
shared framework-independent calculation in `domain/sessions/pricing.ts`.

Before POST, the browser saves the exact payload and idempotency key in
user-scoped session storage. Duplicate submission is disabled. Network failures
and uncertain server errors freeze editing; a retry replays the saved payload.
Reload restores it. An authentication or service failure during replay retains
the pending submission because it cannot resolve the original result. A definitive
first-attempt rejection permits editing and a new key. Success clears pending
state and refreshes `/sessions?created=1` with feedback. Storage must be available
before a request is sent. Room tokens are not stored in browser submission state.

OneMap search is debounced, cancels/discards stale responses, and supports keyboard
selection and pagination. Selecting a venue fills its URA region; editing its name
clears lookup confirmation and region. Manual entry remains available when lookup
is unconfigured, fails, finds no results, or cannot resolve a region. This platform
coordinates venues booked elsewhere; lookup never creates a reservation.
See [venue configuration](../../use-case-config/README.md#venue-search-configuration).

## Configured HTTP contract

Authenticated session API routes declare their `parse`, `run` and `invalidRequestMessage`
through app-owned action factories. Each route's `run` callback visibly invokes
its use case; the factory supplies the common HTTP steps. For example, the
[creation route](../api/sessions/route.ts) declares:

```ts
export const POST = sessionCreationAction({
  parse: parseCreateSessionInput,
  run: (dependencies, { input, submission }) =>
    dependencies.createForSubmission(submission).forBooker(
      input.bookerId, input.booking, input.config,
    ),
  invalidRequestMessage: "Invalid session creation request",
  successStatus: 201,
});
```

[`createAuthenticatedActions`](../http/authenticated-action.ts) owns dependency
loading, authentication, route parameters, JSON-body parsing and error mapping.
Feature factories select their existing dependency getter and response policy;
JSON mutations use `.json`, and authenticated reads use `.get` without reading
a request body. An optional `serialize` callback maps a use-case result to its
HTTP representation. See [ADR-0015](../../docs/adr/0015-declarative-session-http-actions.md).

[`loadDependencies`](../http/load-dependencies.ts) awaits the app-owned
[dependency getter](./server-dependencies.ts). It makes initialization failures
opaque before the feature mapper handles them as JSON 500s.
[`requireUserId`](../http/require-user-id.ts) invokes the endpoint's own
authenticator, rejects absent credentials and validates the verified UUID.
POST's authenticator also checks current active-account access before parsing or
replay. Dependencies and actor identities remain local values in each handler;
the helpers do not modify the Request or store shared actor state.

Creation's factory uses [`SessionApiDependencies`](./dependencies.ts), then the
route's `run` callback constructs a submission-scoped use case and invokes
[`CreateSessions.forBooker`](../../use-cases/sessions/CreateSessions.ts).
Tests inject those dependencies and exercise the real action factories. The
production default never substitutes a fake authenticated user or persisted session.

The shared JSON action distinguishes malformed JSON from an invalid request
schema; only input failures at that boundary become 400 responses. Internal
validation errors from authentication or the use case remain opaque 500s.

[parseCreateSessionInput](./create-session-input.ts) validates the authenticated
user ID separately from the raw `{ idempotencyKey, booking, config }` body.
Booking timestamps are ISO strings with a timezone (`Z` or an offset), converted
to `Date` values for the use case. Unknown fields are stripped. Submission keys
must contain a non-whitespace character and be at most 200 characters; they are
preserved without trimming. Invalid input returns 400 before constructing a
submission use case.

The parser returns
`{ input: { bookerId, booking, config }, submission: { idempotencyKey } }`.
The trusted `bookerId` comes from authentication. Existing parser callers that
hold Date values serialize them first:

```ts
const parsed = parseCreateSessionInput(authenticatedUserId, {
  idempotencyKey,
  booking: {
    ...booking,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
  },
  config,
});
```

Direct use-case callers continue to supply Date-valued booking details.
Successful creation and replay return 201 with
`{ sessionId, roomToken, bookingShareCents }`. Omitted `config.pricePerSlotCents` rounds down equally:
1001 cents over three slots means 333 cents each, 999 cents collected when full,
and a 2-cent shortfall borne by the booker. An optional safe integer chosen price
is validated against `[max(1, ceil(s / 2)), min(2 × s, floor(MAX_SAFE_INTEGER / slots))]`,
where `s = floor(cost / slots)`. Above-cost collection is allowed. The accepted
price is immutable Session state hydrated from `booking_share_cents`; participation,
refund and settlement use that price and historical holds. Apply migration 0008
before deploying this behavior. See [ADR-0012](../../docs/adr/0012-booker-selected-session-pricing.md).
Creation moves no funds. `config.minimumHeadcount` remains required and is
persisted as `minimum_headcount`; it must be an integer between two and
`config.totalSlots`.

| Status | Outcome |
| --- | --- |
| 201 | Created session or replayed a successful submission |
| 400 | Malformed JSON or invalid request structure |
| 401 | No authenticated user |
| 403 | Inactive account, missing email (`EMAIL_REQUIRED`), or unauthorized action |
| 404 | Authenticated User is missing from storage |
| 409 | Payout setup or session-state conflict |
| 422 | Invalid business values |
| 500 | Unexpected initialization, authentication, or persistence failure, or malformed authenticated identity |
| 503 | Required session server settings are missing |

Errors use `{ error: { code, message } }`. Unexpected failures return the fixed
`INTERNAL_ERROR` response. Retrying the same booker's submission key must return
the original result; an intended new session needs a new key. The authentication
integration must verify current active-account access and a present email address
before parsing or replay. The transaction repeats these checks before claiming
an idempotency key, including each database retry.
The persistence integration must commit the Session and replay result atomically.
See the [integration requirements](../../use-case-config/README.md#authentication-and-atomic-persistence).

## Documentation and validation

[Swagger UI](http://127.0.0.1:3000/api-docs) and `/api/openapi` publicly document
the configured contract and missing-settings response. Swagger's Try it out
sends a real request; configured creation requires a valid bearer token.
The creation operation is registered in [this feature's OpenAPI module](./openapi.ts).
Storybook's `Sessions/Create session` examples use the production wizard and
focused shell, with interaction and accessibility checks for all steps, date
editing, slot limits, price adjustments, lookup/fallback, stale results and submission
failures. `npm run test:sessions:integration` applies all migrations to a disposable
stack and verifies persistence, replay, real authentication, success navigation,
short-screen keyboard operation and the visibility-management regression. Browser
screenshots cover 390px, tablet (768px) and desktop (1280px).
The [shared OpenAPI guide](../openapi/README.md) explains how feature registrations
are assembled and how to add operations to the reference.

The [route tests](../../tests/app/sessions/create-session-route.test.ts) exercise
creation, replay, validation, and failures with injected dependencies and the
real use case. The [E2E tests](../../tests/e2e) load the documentation and check
503 against an unconfigured Next.js server. Separate service-backed suites
exercise real authentication, database persistence, concurrent replay and
rejection after deactivation; see the configuration guide for their commands.

The discovery page is covered by UC2-01. Participant removal is documented below;
Realtime subscriptions remain separate work.

## Private-session invitations

Upcoming hosted-session cards offer **Copy invitation link**. The browser retrieves
the link only on request, adds its current origin and copies it. Loading, copied
and retry states are announced; clipboard failure exposes a labelled, selectable
link. Creation still redirects to hosted sessions, so sharing works immediately
and after reload.

`GET /api/sessions/{sessionId}/invitation` accepts login cookies or bearer
authentication and returns `{ invitationPath }`. An active owner can retrieve
an OPEN, upcoming session's link, including when it is full. Missing authentication
is 401, inactive/foreign access 403, missing account/session 404, and started/closed
sessions 409. Invalid IDs are 400, missing configuration 503, and unexpected
failures opaque 500. Every response is `no-store`.

The HTTP serializer creates `/sessions/{sessionId}/join?token=…` from the persisted
room token without changing it. Reloads and visibility changes preserve the link.
No migration or token rotation is introduced. Room tokens remain excluded from
ordinary discovery, hosted-session summaries and application logs.

The invitation page is public and lives outside the authenticated management
layout. Its Server Component invokes a narrow PostgreSQL preview capability
directly. A valid invitation displays venue, sport, region, Singapore dates/times,
total capacity and booking share. Wrong or absent tokens, unknown sessions, and
started/closed sessions all show the same unavailable page without private facts.
Infrastructure failure instead offers Retry. Optional authentication failure does
not prevent anonymous preview. Preview and auth continuation responses use
`no-store` and `no-referrer`; the invitation page also declares `noindex`.

Opening a link never joins or holds funds. Guests choose **Log in to join** or
**Create account**; sanitized `next` survives registration, confirmation emails,
resend and callback recovery. See the
[authentication guide](../(auth)/README.md#invitation-continuation) for
Supabase callback allowlist configuration. Signed-in visitors explicitly confirm
through the shared join component and existing commitment endpoint, with the
exact room token. Eligibility, available funds, replay keys, uncertain-response
retry and full-session waitlisting retain their existing rules.

Unit, database and browser acceptance tests cover access and token boundaries,
stable links, lifecycle/privacy checks, two-context creation-to-join, registration
return, clipboard fallback, keyboard use at 390px, single holds and replay, and
waitlisting without a hold. Run `npm run test:sessions:integration` for the real
disposable-stack suite; `npm run test:storybook` exercises sharing and preview UI
states without provider dependencies.

## Personal sessions feed

`/sessions` opens **Joined**; `?tab=hosting` opens **Hosting**. Returning from
creation with `?created=1` selects Hosting and announces success. Desktop Joined
uses a dated timeline: scrolling selects the next/previous card, moves the black
marker, and reveals a compact image, title, venue, time and player-count summary.
**View details** opens Details/Participants and calendar/map actions in a transient
dialog. Closing it returns keyboard focus to its trigger. Date buttons and collapsed cards provide
keyboard alternatives; keyboard focus within a card prevents scroll selection
from removing that control. Reduced-motion preferences remove transitions.
Desktop Hosting has equal-width upcoming carousel cards and compact history rows;
it has no timeline. Both views use the original shared sidebar from `main`, with
the sessions breadcrumb and bordered content panel inside the page.
Below 768px both tabs use simple date/title cards, with details in a dialog.

Initial loading uses matching skeletons: the Joined date rail and expanded card,
Hosting's upcoming cards and history rows, or simple dated cards on mobile. The
host-management dialog also shows a controls skeleton while retaining its title
and Close button. Decorative placeholders are hidden from assistive technology
behind one loading status, and their pulse respects reduced motion. Background
refreshes and pagination keep existing content visible.

On the first desktop Joined visit, the rail draws downward, the marker travels to
the selected date, then the dates, artwork, title, venue, metadata, action and
neighboring rows reveal individually. The visible rail draws for 560ms, the dot
travels for 380ms, and details fade in over 420ms with a bounded 70ms stagger.
The sequence waits for URL restoration and reserves the final layout to avoid
shifts. Offscreen history does not delay the selected card. It runs once per overview/account visit, including when arriving from
Hosting. Interaction, resizing or a motion-preference change finishes it
immediately; mobile and reduced-motion users see the final state directly.

`SessionsController` uses React Query `useInfiniteQuery`, with account/tab-scoped
caches and the server's cursor. An intersection observer requests the next page;
an accessible Load more button provides the same action. Pagination errors retain
loaded records and expose a retry. A different account remounts the controller.
An account-scoped Zustand store keeps guarded browsing/viewing-session modes,
timeline selection and remembered detail panels. Its validated URL storage persists
the selected tab, Joined session ID and Details/Participants panel. Reloading a link
expands the timeline card; the remembered panel appears when View details is opened.
Dialogs remain transient, and changing accounts clears the account-specific selection.

Hosting cards open the existing visibility, invitations, cancellation and
attendance workflows. Cancellation recovery stays mounted at page scope, so a
saved request can be retried after reload even when its card has moved to history.

All display dates use Singapore time. Calendar and map links use the stored
session facts. The feed does not contain court numbers, notes, names or portraits;
the overview shows the sport and aggregate player counts instead. Tennis imagery
is decorative reference-derived artwork; other sports retain their own imagery.
See [visual evidence](../../docs/assets/sessions/README.md) and
`Sessions/Overview` / `Sessions/Overview loading` in Storybook.

`/sessions` has separate Joined and Hosting views backed by
`GET /api/sessions/mine?tab=joined|hosting&cursor=…`. Omit `cursor` for the first
page; omitted `tab` defaults to Joined. The response contains `sessions`,
`nextCursor` (null at the end), `asOf`, `upcomingCount` and `pastCount`. Each page
contains at most 12 sessions, while counts cover the complete selected tab.

Hosting includes sessions owned by the signed-in user. Joined includes that
user's participation records in other hosts' sessions, including waitlists and
historical departures. Public visibility alone never grants access through this
personal endpoint. The reader checks current account status and session scope in
one database statement; inactive or missing accounts cannot obtain session data.
Both verified bearer and same-origin login-cookie authentication are supported.
Responses are `no-store`, and client caches are scoped to the user and tab.

Open sessions that have not ended appear in the upcoming section, including
sessions currently in progress. Joined additionally requires a COMMITTED or
WAITLISTED participation for that section. All other eligible records appear in
history, including cancelled sessions and departed participation records. Upcoming
sessions sort by start time ascending, followed by history by start time
descending; session ID ascending breaks ties in each section.

The first request captures `asOf`. The opaque cursor binds the tab, authenticated
user, time boundary, section and last returned start time/session ID. The adapter
uses a SQL keyset predicate and bounded page size rather than loading all rows or
using offsets. Later requests preserve that time boundary so ordinary clock
progression cannot move rows between upcoming and history during scrolling.
This is not a long-lived database snapshot: membership and lifecycle changes
remain live, and a fresh first page reconciles them. Malformed cursors or cursors
from another user or tab return 400.

Session facts include dates, sport, venue, region, total capacity, committed
participant count, immutable price per slot in integer cents, visibility, session
status, viewer role, viewer participation status and section. Hosting also
receives `unverifiedCount` for ended OPEN sessions awaiting attendance. Counts do
not imply seat availability, because replacement reservations have separate
capacity rules. No room tokens, participant identities, invented court labels or
notes are included. The existing hosted management endpoint supplies authoritative
mutation actions separately.

[`ListSessionFeed`](../../use-cases/sessions/ListSessionFeed.ts) owns the page and
account policy; [`PostgresSessionFeedReader`](../../lib/sessions/postgres-session-feed-reader.ts)
owns SQL and persistence translation. The app validates and serializes cursors
and timestamps, and [`session-feed-transport`](./session-feed-transport.ts)
validates every browser response and forwards React Query cancellation.
No new migration or environment setting is required. Database coverage checks
private-session isolation, account status, in-progress/history classification,
attendance counts, and tied timestamps across multiple page boundaries.

## UC2-03a: visibility management

`GET /api/sessions/hosted` supplies management actions for every open, upcoming
session hosted by the signed-in user, ordered by start time and session ID. It
includes full sessions; their action list omits visibility changes. Availability includes direct-invitation reservations
through `Session.getAvailableSlots`; the UI does not calculate capacity itself.
Rows display confirmed visibility with per-row saving, success and error feedback.
The UI follows the returned HTTP actions. Existing cookie-authenticated server
actions and bearer APIs invoke the same use cases directly.

`PATCH /api/sessions/{sessionId}/visibility` accepts:

```json
{ "visibility": "PUBLIC" }
```

The alternative value is `PRIVATE`. A successful commit returns 200 with
`{ sessionId, visibility }`. The authenticated user supplies the booker identity;
the request cannot impersonate another owner. This sets a target value rather
than inverting stored state. Same-value requests still check current eligibility.
No funds move and no creation-style replay key is required.

| Status | Outcome |
| --- | --- |
| 200 | Visibility committed |
| 400 | Invalid session ID, malformed JSON, or invalid visibility |
| 401 | Missing or invalid authentication |
| 403 | Inactive application account or another session's owner |
| 404 | Missing User or Session |
| 409 | Session is full, started, or closed |
| 500 | Unexpected provider, hydration, transaction, or initialization failure |
| 503 | Management server settings are missing |

Errors retain the shared `{ error: { code, message } }` envelope. Application
access requires an active account, checked again on the complete User inside
the transaction. The underlying Booker behavior still allows an inactive owner;
that domain policy is deliberately unchanged. Ownership and session lifecycle
rules remain in `Booker.changeVisibility`.

Management requires migration 0007. It adds complete Session hydration facts and
ordered participation storage; see the [configuration guide](../../use-case-config/README.md#session-management-configuration).
The writer changes only visibility, preserving participants, holds, settlement
facts and ledger entries. The use case obtains its clock after loading and
locking state, so time spent waiting cannot authorize an already-started session.

Discovery refreshes in the background every second while visible and online.
The three-second acceptance target is measured after mutation success on a healthy
foreground page. Draft filters, focus, scroll and the current pagination cursor
stay in place. Offline or background tabs refresh when they become active again.
The browser suite exercises actual owner controls and an independently signed-in
participant's already-open discovery page through the disposable stack.

## UC2-03c: cancellation and wallet refunds

An active owner can cancel any OPEN, upcoming session, including a full one.
The page loads a server-calculated refund preview before explicit confirmation.
It shows affected participants separately from refund recipients and returns
outstanding held shares to in-app wallets. Venue cancellation is external.

Bearer endpoints (all responses use `Cache-Control: no-store`):

- `GET /api/sessions/{sessionId}/cancellation-preview` returns `{ sessionId,
  affectedParticipantCount, refundRecipientCount, totalRefundCents, previewVersion }`.
- `POST /api/sessions/{sessionId}/cancel` accepts `{ idempotencyKey, previewVersion }`
  and returns `{ sessionId, status: "CANCELLED", refundRecipientCount, totalRefundCents }`
  only after commit. The key is a UUID; the version is an opaque SHA256 string.

Identity comes from the verified bearer token or cookie. API routes and page
server actions invoke the same coordinators directly. Unknown request fields do
not override identity or refund amounts. Missing configuration is 503, invalid
input 400, unauthenticated access 401, inactive/foreign access 403, missing records
404, and lifecycle/stale-preview/request-key conflicts 409. Unexpected failures
and financial projection contradictions return opaque 500 errors.

The confirmation version covers authoritative cancellation state; visibility
changes alone do not invalidate it. A changed participant/hold requires a new
preview and another confirmation. Same-key retries return the original committed
result without extra refunds, after checking current active-account access.
Reuse the identical key and payload after an ambiguous failure. The page stores
that confirmed request in user-scoped session storage for reload recovery, and
retains completion feedback after the session disappears from upcoming results.
Cancellation is never a hard delete. Prior removed/cancelled participants and
terminal holds remain unchanged; live participants become CANCELLED, invitations
are cleared and outstanding holds are refunded at their historical amounts.
No withdrawal fee or payout-account readiness condition applies.

The existing discovery polling removes cancelled sessions within three seconds
for visible, online pages under healthy service conditions. Production needs
migration 0007 before the reader/endpoint; cancellation adds no migration.


## UC2-03b: participant list, removal and wallet refunds

A hosted session's **Manage participants** link opens
`/sessions/{sessionId}/participants`. Only its active owner can read participant
names and statuses. Records retain their participant-list order, including
withdrawn and removed history. Account display names are queried through the
transaction's PostgreSQL connection; inactive accounts display “Deleted user”.
Participant-list responses contain no room tokens, emails, wallet IDs or ledger
history.

Only a COMMITTED participant in an OPEN session strictly before its start is
removable. The existing Booker domain action refunds the entire historical held
amount, including within the 30-hour participant-withdrawal window. It leaves
the Session OPEN, retains the participation as REMOVED and prevents rejoining.
Removing an accepted replacement does not restore the consumed invitation or
refund its original participant again. No email-verification or payout-readiness
requirement is added to the existing active-owner management policy.

Bearer endpoints and cookie server actions invoke the same coordinators:

- `GET /api/sessions/{sessionId}/participants` returns session display facts,
  available capacity and ordered `{ participationId, displayName, status,
  canRemove }` rows.
- `GET /api/sessions/{sessionId}/participants/{participationId}/removal-preview`
  returns `{ sessionId, participationId, refundCents, previewVersion }`.
- `POST /api/sessions/{sessionId}/participants/{participationId}/remove` accepts
  `{ idempotencyKey, previewVersion }` and returns `{ sessionId, participationId,
  status: "REMOVED", refundCents }` after commit. The key is a UUID and version
  is an opaque SHA256 string. Refunds are integer cents and server-calculated.

Every HTTP response is `no-store`. The shared error envelope distinguishes invalid
input (400, including `INVALID_INPUT`), unauthenticated access (401), inactive/foreign
access (403), missing records (404), lifecycle/stale-preview/idempotency conflicts
(409), opaque infrastructure errors (500), and missing settings (503).

The preview covers the target's participation/hold and session ownership, start
and lifecycle. Visibility and unrelated participants do not invalidate it. Both
preview and submission obtain server time after acquiring the session lock. A
stale preview requires a new quote and explicit confirmation; an unchanged quote
cannot authorize a removal after start.

The dialog shows the name and exact wallet refund before confirmation. Before
sending, it persists the confirmed payload under
`participant-removal:{userId}:{sessionId}`. Duplicate clicks are disabled. Network
or server failures retain the request, and reload restores it even when the row
is already REMOVED. Authentication loss during replay retains the original key.
Blocked storage prevents sending; unreadable saved requests remain preserved and
block a new removal until recovery. Successful completion refreshes the list and
capacity, announces the result and restores focus to the trigger or page heading.

This slice frees capacity and preserves FIFO priority and direct reservations.
It does not invoke automatic promotion or send notifications. Those production
workflows belong to Yajie; queued users await that integration. Database and
browser removal tests use real ledger-backed participant fixtures. Invitation
acceptance tests separately exercise the mounted commitment endpoint.

Feature stories exercise confirmation, retry, stale previews, storage recovery,
keyboard focus and the 390px layout. `npm run test:sessions:integration` includes
real PostgreSQL refund/rollback/race checks and authenticated browser/API tests.
