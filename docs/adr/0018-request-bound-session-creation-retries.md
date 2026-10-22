# ADR-0018: Request-bound HTTP session-creation retries

- Status: Proposed; illustrative implementation on a separate fork branch.
- Date: 2026-10-23
- Use case: UC2-02 Create Session.
- Clarifies: ADR-0011, ADR-0015 and ADR-0016; their dependency and ownership rules remain unchanged.
- Proposed behavioral change: newly recorded HTTP creation submissions reject reuse of a key with different parsed input. Existing key-only callers and already-recorded legacy results retain their replay contract.

## Context

The current key-only replay policy is deliberate, not proof that the architecture
is broken. Existing route and use-case tests explicitly replay changed valid input.
Payload comparison is a stricter optional API contract. This branch illustrates
that contract without moving idempotency into `CreateSessions` or domain objects.

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

`RequestBoundSessionCreationSubmission` extends the existing key-only metadata
shape. The factory and PostgreSQL adapter accept either shape for source
compatibility. The HTTP route always constructs the bound shape. Existing
key-only test adapters and non-HTTP callers retain their previous behavior;
they do not gain payload comparison merely by accepting a structurally wider
object. New strict callers should construct the bound shape explicitly.

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
| Same key, different authenticated actor | Independent actor-scoped submission. |
| Failed transaction | Roll back the claim and work; allow a later retry. |
| Inactive actor | Reject before reading a replay result. |

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

Legacy records therefore cannot detect changed-payload reuse. This is a stated
compatibility limitation, not an attempt to reconstruct missing history. Do not
rotate keys, delete old records or backfill guessed fingerprints. The extra
transaction is limited to conflict/legacy recovery paths.

## Validation and review

Added tests:

- `tests/app/sessions/request-bound-creation-input.test.ts`: trusted parsed
  metadata, unchanged business input, equivalent timestamps, changed choices,
  and safe HTTP conflict responses.
- `tests/lib/sessions/request-bound-creation-transaction.test.ts`: same-request
  replay, changed payloads, actor scoping, new keys, legacy recovery,
  authorization, rollback and replay-only fallback safety. Its fake driver
  models transactional rows, not real PostgreSQL concurrency.

Run in a normal checkout with dependencies installed:

```sh
npm ci
npm run typecheck
npm run lint
npx vitest run --project unit tests/app/sessions/request-bound-creation-input.test.ts tests/lib/sessions/request-bound-creation-transaction.test.ts
npm test
npm run test:sessions:integration
```

During preparation, all eight changed/added TypeScript files passed syntax
transpilation and 14 adapter checks passed in an isolated harness with mocked
transaction infrastructure. That harness is not Vitest and does not verify
PostgreSQL, actual ledger SQL, Zod or whole-repository type compatibility.
The full commands above were not run because the execution environment could
not fetch the repository/dependencies. No passing CI claim is made.

Before adoption, review this stricter HTTP policy with the session owner and
ledger reviewer, add/run real-database changed-payload and concurrent-retry
coverage, and align route tests that currently use the key-only fake. Existing
key-only tests are retained rather than silently rewritten as a different
contract. This proposal does not redefine commitment or payout idempotency.
