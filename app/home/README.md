# Personal Home dashboard

Authenticated `/` shows the next 20 upcoming bookings, ordered by Singapore start
time and session ID. Anonymous visitors continue to see the public landing.
Mobile Home appends a public discovery feed below those personal bookings.
Desktop retains its existing dashboard and `/discover` actions. Legacy query
parameters on `/` do not filter a user's bookings or the mobile feed.

The server verifies cookie identity and active-account access before acquiring a
reader. `ListUpcomingBookings` returns only sessions owned by that user or having
their `COMMITTED` participation. Both public and private sessions are eligible
through those relationships. Past, cancelled, settled, waitlisted, withdrawn and
unaccepted replacement invitations are excluded. Owner/participant overlap yields
one card. The query reads an explicit summary and never loads financial data,
room tokens or a participant roster. No migration or browser table grant is added.

Cards use a date block, sport-derived booking title, venue and Singapore time
range; full years and overnight end dates remain available. Mobile uses one
column; desktop uses two with the existing Booking sidebar and header.

`HomeState` is an exclusive `loading | ready | empty | error` union. Personal
booking results live in server props. Retry derives loading from React's navigation transition. An
unsuccessful booking read stays an error: it must not be represented as an empty
diary or a weather card.

Only a successful empty diary triggers the national Singapore 24-hour weather
forecast. Weather has its own `ready | unavailable` state; no forecast values are
invented. It includes the forecast period, update timestamp and NEA attribution.
The forecast cache is shared public data; personal bookings are never cached.
See [weather reader notes](../../lib/weather/README.md).

Stories render deterministic booking/weather fixtures without database or network
access. Unit tests cover authorization and conditional weather loading, disposable
database tests exercise owner/participant visibility and exclusion rules, and
authenticated browser tests verify the mobile/desktop dashboard and Search flow.
Existing public discovery API and Swagger contracts are unchanged.

## Mobile discovery (UC2-01/04)

`MobileHomeDiscovery` mounts below Upcoming Bookings only below 768px. React
Query's `useInfiniteQuery` owns its loading/error state, cursor pages and cache,
scoped to this Home screen. The existing authenticated `GET /api/sessions`
returns 20 public summaries per page. The cursor stays in React Query, so
scrolling never navigates away from Home or changes its URL. Desktop mounts no
feed observer or query. The standalone Discover route remains available for
desktop search and existing direct links.

A sentinel requests the next page near the viewport, with a keyboard-accessible
Load more fallback. Requests are serialized, repeated cursor values stop
continuation, and session IDs deduplicate page boundaries. A failed continuation
preserves loaded cards and requires Retry; it cannot spin an automatic retry
loop. The query signal cancels requests on unmount. Realtime invalidations,
visibility/online reconciliation and server-anchored session expiry reuse the
existing discovery scheduler, which delegates all fetching to React Query.

Cards use the existing local sport photography and show Singapore dates/times,
venue and the accepted integer-cent share. View booking opens an on-page summary
dialog. Join now reuses the existing confirmation and idempotent commitment
transport; a confirmed join refreshes the server-owned personal diary. Private
invitations, wallet rules and available-place calculation remain with their owners.

The mobile shell has one transparent outline notification bell and an unread
dot. Its former Search shortcut is removed. The empty-diary Find a session
action scrolls to `#discover-bookings`; account/logout remain in Settings.

On 30 October 2026, 70 Chromium story checks passed across the mobile feed,
mobile Home, AppShell, Notifications, desktop Discover and join confirmation.
They cover real browser scrolling without clicking or changing the URL, append/dedup,
failed-page retry, repeated cursors, unmount cancellation,
desktop suppression, live invalidation, on-page details and successful joining.
Transport and shared-scheduler unit checks also passed. Updated service-backed
browser scenarios have a collection-only check using a temporary configuration;
they were not executed against Supabase. The disposable stack is unavailable and
the repository's existing Groups build failures remain.
