# ADR-0018: Request-bound HTTP session-creation retries

- Status: Proposed; pending session-owner and ledger review before adoption.
- Date: 2026-10-23
- Use case: UC2-02 Create Session.
- Clarifies: ADR-0011, ADR-0015 and ADR-0016; their dependency and ownership rules remain unchanged.
- Proposed behavioral change: newly recorded HTTP creation submissions reject reuse of a key with different parsed input. Existing key-only callers and already-recorded legacy results retain their replay contract.

## Context

The existing key-only replay policy returns the first result even when a retry
changes valid booking input. This proposal adopts a stricter HTTP contract for
newly recorded submissions so accidental key reuse cannot silently return an
unrelated booking. Idempotency remains outside `CreateSessions` and domain objects.

An idempotency key identifies the logical submission. A payload fingerprint
additionally detects accidentally reusing that key for different booking details.
These are different responsibilities; deduplication already works without the
additional comparison.

## Responsibility split

```text
POST /api/sessions
  -> existing parser: authenticate-supplied actor, Zod validation, Date conversion
  -> API wrapper: { input, submission: { idempotencyKey, request: input } }
  -> existing createForSubmission factory: constructor wiring only
  -> unchanged CreateSessions.forBooker(bookerId, booking, config)
  -> PostgreSQL transaction adapter: scope key, authorize, fingerprint, claim/replay
  -> existing LedgerUnitOfWork: replay result and session write commit together
```

`app/sessions/request-bound-creation-input.ts` wraps the existing parser. It does
not hash, query storage or implement business validation. Client-supplied actor,
request metadata, unknown fields and proposed fingerprints are not trusted.
Equivalent timestamp offsets become the same `Date` instants. Existing stable
serialization in `lib/money/idempotency.ts` ignores object-property ordering.
This is not a new semantic-equivalence engine: omitted optional choices and
explicit defaults are not automatically considered identical.

`SessionCreationSubmission` has a retry key and optional parsed request metadata;
`RequestBoundSessionCreationSubmission` requires that metadata. The app-owned
`SessionApiDependencies.createForSubmission` requires the bound type, and the
HTTP parser always constructs it. The PostgreSQL adapter also accepts key-only
submissions for existing non-HTTP callers. Those callers retain key-only replay
for their own legacy records; they cannot replay a newer payload-bound record.
The request metadata is separate from the use case's business input.

The PostgreSQL adapter snapshots the supplied metadata, verifies its actor
matches the use-case actor, and supplies the actual parsed request to the
existing ledger unit of work. Hashing and durable comparison remain in
infrastructure. `CreateSessions.ts`, domain models, generic unit-of-work
contracts, shared ledger implementation and database schema are unchanged.

## Expected HTTP behavior

| Submission | Result |
| --- | --- |
| New key | Execute and record the result with its payload fingerprint. |
| Same actor, key and normalized input | Replay the original result; no second session. |
| Same actor and newly bound key, changed input | HTTP 409 `IDEMPOTENCY_CONFLICT`; no new work. |
| Same actor and successful legacy key, changed valid input | Replay the original result; the old record has no payload fingerprint. |
| Same key, different authenticated actor | Independent actor-scoped submission. |
| Failed transaction | Roll back the claim and work; allow a later retry. |
| Inactive actor | Reject before reading a replay result. |
| Key-only caller retries a payload-bound key | `IDEMPOTENCY_CONFLICT`; no replay or new work. |

Error mapping belongs to `app/sessions/create-session-response.ts`; it uses fixed
messages rather than returning the ledger error's internal key or request data.
No browser, CSS, navigation, discovery, wallet or payout behavior is refactored.
The discovery GET handler in the shared route file is unchanged.

## Legacy records and deployment

Existing successful records contain only a fingerprint of their key. Their
original payload cannot be recovered from that digest. Rejecting every such
retry would break recovery; assigning a new key could create duplicate sessions.

After a bound request conflicts, the adapter probes the same actor-scoped key
with the exact old fingerprint format. A successful legacy record may replay.
The probe's work callback always throws, so it cannot create a session if the
key disappears or becomes claimable. Both attempts authorize the current actor.
A newer bound record still conflicts during this probe.

Legacy records therefore cannot detect changed-payload reuse. Do not rotate keys,
delete old records or backfill guessed fingerprints. No schema migration is
required. The extra transaction is limited to conflict/legacy recovery paths.

Deployment uses a coordinated cutover with no feature flag: retire every old
creation writer before accepting payload-bound submissions, including old runtime
instances and non-HTTP writers that may reuse the same keys. An old runtime or
key-only caller computes the legacy fingerprint and cannot replay a payload-bound
result. Once bound records exist, a rollback must retain this compatible adapter
and HTTP parser; rolling back to the former key-only implementation would break
recovery of those results.

[PR #112](https://github.com/rbrishi15/booking-web-manager/pull/112) remains open.
Its dependency fixes must reach `main` through their reviewed PR before this
change is integrated. Update this branch from that reviewed `main`; do not copy,
cherry-pick or merge its unreviewed feature source into this branch. Follow the
[contribution workflow](../contributing-workflow.md) for dependency handoff and
independent review. Session-owner and ledger review remain adoption prerequisites.

## Validation and review

Validation for adoption covers:

- `tests/app/sessions/request-bound-creation-input.test.ts`: trusted parsed
  metadata, unchanged business input, equivalent timestamps, changed choices,
  and safe HTTP conflict responses.
- `tests/lib/sessions/request-bound-creation-transaction.test.ts`: same-request
  replay, changed payloads, actor scoping, new keys, legacy recovery,
  authorization, rollback and replay-only fallback safety. Its fake driver
  models transactional rows, not real PostgreSQL concurrency.
- General route tests retain the key-only `RequestSessionCreationTransaction`
  fake for HTTP/domain behavior. They verify trusted normalized metadata is
  forwarded, identical retries and sanitized `LedgerError` responses; they do
  not establish the production adapter's request comparison semantics.
- Real PostgreSQL tests cover changed-payload conflicts, concurrent identical
  and mismatched submissions, legacy replay, rollback, current account access
  and rejection of payload-bound keys by key-only callers.
- Authenticated HTTP tests cover a new key, identical replay, changed valid input
  returning 409, normalized timestamp replay and persisted legacy recovery.

Run in a normal checkout with dependencies installed:

```sh
npm ci
npm run typecheck
npm run lint
npx vitest run --project unit tests/app/sessions/request-bound-creation-input.test.ts tests/lib/sessions/request-bound-creation-transaction.test.ts
npm test
npm run test:sessions:integration
```

### Local validation, 2026-10-23

Fresh `npm ci` completed. The 77 focused tests and seven OpenAPI tests passed.
Scoped lint passed for all changed TypeScript files. The full unit run passed
2,814 tests with three inherited profile-test failures; full typecheck reported
only inherited profile/app-shell diagnostics, and full lint reported one
inherited unused declaration in app-shell. These repository-wide checks remain
unresolved pending the prerequisite fixes; scoped success does not make them green.

The final real-database run passed 99 tests, including eight new request-bound
scenarios using the production PostgreSQL adapter and an assertion that key-only
callers reject bound records. The targeted Playwright `tests/e2e/session-api.spec.ts`
run passed all seven tests in 5.1 seconds, including identical replay with
equivalent timestamp offsets. It used an actual Next.js development server and
disposable Supabase through the existing disposable-stack runner with a temporary
development `webServer` configuration. Stack cleanup completed successfully.

This targeted authenticated HTTP run did not use a production build or execute
the full authenticated browser suite. Production-build integration remains
pending the PR #112 prerequisite. Fake-driver and general route tests alone do
not establish the bound HTTP retry contract. This proposal does not redefine
commitment or payout idempotency.
