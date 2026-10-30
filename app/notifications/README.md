# Notification inbox

`/notifications` is the signed-in, date-grouped inbox from issue #152. It uses
the existing AppShell and theme tokens, a desktop sidebar link and a mobile
bell. The page groups dates in Asia/Singapore and supports category/unread
filters, individual read state, mark all read, refresh and older-page loading.

On mobile, the transparent outline bell replaces the former account-menu button.
An unread dot appears when needed; discovery is inline on Home, so the Search
shortcut is removed. Account details and logout are available from the Settings tab;
Groups remains available from Sessions. There is one notification shortcut in
the mobile header.

## Events and persistence

The existing UC2-04/05/06 commitment alerts are saved by `InboxNotifier` after
the originating transaction commits. Web Push is a second, optional channel;
VAPID configuration and browser permission are unnecessary for the inbox.
Notification copy and destinations are shared with `pushPayloadFor`.

All six existing event kinds belong to Bookings. Groups, Payments and System
have empty states until their producers are implemented separately. There is
no historical backfill, synthetic activity, new group/payment producer or
message subsystem in this change.

Migration `0017_notification_inbox.sql` adds the table and indexes. Apply it
before deploying this app version. It retains existing tables and data. A
rollback can leave the new table in place; do not delete inbox history.

Persistence deduplicates by recipient, kind, session and committed action key.
Replaying an action keeps the original notification and read state, while a later
action can produce a separate alert even when waitlist re-entry reuses the
participation ID. The verification reminder occurs
once per session. The commitment and scheduler configurations both use the
persistent notifier. The scheduler now claims verification reminders even
without push settings; a persistence failure releases their claims for retry.

Delivery is still best-effort after commit, as specified by the existing port.
This is not a transactional outbox: a crash between commitment and delivery can
lose an alert, and ordinary action-delivery failures depend on action replay.
Persistence failures never roll back committed session or financial changes.

## HTTP and access

`GET /api/notifications` uses the shared authenticated action and accepts a
verified bearer token or read-only login cookie. Every query checks the active
profile and scopes rows to that identity. The result contains at most 30 items,
the full unread count and a `(createdAt, id)` continuation. Both cursor fields
must be supplied together. Timestamps have millisecond precision so serializing
the cursor cannot skip rows with sub-millisecond timestamps.

`PATCH /api/notifications` requires a bearer token and `{ id: UUID | "all" }`.
It only updates the caller's unread rows; unknown IDs and other recipients'
IDs are a no-op. Mark all covers the statement snapshot. Direct browser table
access is revoked, RLS is enabled and HTTP responses use `Cache-Control: no-store`.
The operations are documented in the public OpenAPI document.

The client ignores cancelled responses when filters change, preserves items
on a load-more failure, and leaves read state unchanged on a failed save.
Opening an unread row records read status before navigating. Modified link
clicks retain normal browser navigation. Focus and explicit refresh reload the
page; successful read mutations also refresh the shell badge.

## Validation

Unit tests cover HTTP parsing, authenticated identity, safe errors, notifier
failure isolation and Singapore calendar grouping. The shared API inventory
exercises both methods before business capabilities can be accessed.

`npm run test:storybook -- app/notifications/_components/notifications.stories.tsx components/ui/app-shell.stories.tsx components/ui/navigation-icon.stories.tsx`
checks desktop/mobile presentation, filtering, read mutations, empty and
failure states, late-response cancellation, navigation and accessibility.

`NOTIFICATION_TEST_DATABASE_URL=... npm test -- tests/lib/commit/notification-inbox.db.test.ts`
uses an isolated schema on a disposable PostgreSQL database with `anon`,
`authenticated` and `service_role` roles. It applies the real new migration
against a minimal profiles prerequisite fixture and verifies replay, read state,
recipient isolation, equal-timestamp pagination, account status and privileges.
It does not establish full Supabase migration-sequence or hosted acceptance.

### Local validation — 29 October 2026

Against `main` at `22ae12f`:

- 177 targeted tests passed, including six real PostgreSQL inbox tests and
  the complete API authentication inventory.
- 33 Chromium Storybook interaction/accessibility tests passed across the
  inbox, AppShell and navigation icons. Captured 1600px/1440px desktop and
  390px mobile evidence in `docs/assets/notifications`; no horizontal overflow.
- Full unit run: 3,286 passed, two failed, 63 skipped, one TODO. Both failures
  are unchanged from the baseline in `tests/app/groups/groups-page.test.ts`:
  “renders the new overview with real organiser and membership information”
  and “keeps the leave confirmation visible on the overview”. Both throw
  `PageHeader is not defined` from `app/groups/page.tsx`.
- Typecheck retains the baseline's 12 errors in `app/groups/page.tsx`;
  lint retains that file's two unused-variable errors. No notification-file
  diagnostic was reported. `npx next build` compiles the application, then
  fails on those existing Groups lint errors.
- Independent code review found the waitlist re-entry deduplication case;
  committed-action keys and regression tests resolve it. No high-risk blocker
  remained in the follow-up review. Uppercase notification UUIDs are normalized
  at the HTTP boundary and covered by a regression test.

Full Supabase migration-sequence acceptance remains for CI, and hosted migration
or deployment was not performed. The PR remains a draft while the existing
Groups failures block required repository checks; independent owner reviews
and Rishi's merge coordination are still required.

### Mobile shortcut update — 30 October 2026

Replaced the account shortcut with the bell and moved the existing logout action
to Settings. All 48 relevant Chromium stories passed across AppShell, mobile
Home, Settings and Notifications, including keyboard access, 44px touch targets,
the notification destination and the Settings logout action. The full unit run
still reports 3,286 passed and the same two Groups failures; typecheck and lint
retain only the previously recorded Groups diagnostics.

### Inline mobile discovery update — 30 October 2026

Mobile Home now uses React Query for the infinite discovery feed below personal
bookings. The header Search icon is removed and the bell uses an outline on a
transparent background with an unread dot. Details open in a dialog, and joining
retains the existing confirmation and retry contract. See the
[Home guide](../home/README.md) for pagination and live-update behavior.

All 70 relevant Chromium stories passed, including an actual browser scroll that
loads the next page without clicking or changing the URL. The full unit run now
has 3,290 passing tests and the same two Groups failures. Typecheck and lint retain
the same Groups diagnostics; the production compiler succeeds before lint stops
the build on those existing errors. Independent review of the new feed found no
actionable blocker. The five updated service-backed browser scenarios were
collected but not executed against a disposable Supabase stack.
