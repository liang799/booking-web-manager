# UC2-02 request-bound retry adoption proposal

This branch proposes a stricter HTTP retry contract while keeping the
`CreateSessions` use case and domain unchanged.

Read [ADR-0018: Request-bound HTTP session-creation retries](../adr/0018-request-bound-session-creation-retries.md)
for the flow, legacy-record compatibility, coordinated cutover, tests and
validation status. Adoption is pending session-owner and ledger review.

The implementation follows these boundaries:

1. `app/sessions/request-bound-creation-input.ts`: attach parsed request data as submission metadata.
2. `app/api/sessions/route.ts`: use that API parser wrapper; the use-case call is unchanged.
3. `lib/sessions/postgres-session-creation-transaction.ts`: pass metadata to the existing atomic fingerprint/replay mechanism.
4. `app/sessions/create-session-response.ts`: map request mismatch to a safe 409 response.

New HTTP submissions bind the key to parsed input. Identical retries return 201;
changed valid input for a payload-bound key returns 409 `IDEMPOTENCY_CONFLICT`.
Successful legacy keys still replay their original result even when valid input
changes. Key-only callers retain their legacy contract but cannot replay bound
records.

Retire old creation writers before enabling bound submissions. There is no staged
feature flag; rollback must retain the compatible adapter and HTTP parser once
bound records exist. No fingerprint backfill or schema migration is needed.
PR #112's open dependency fixes must arrive through reviewed `main` before
integration; this branch does not import its feature source. See
[ADR-0018's dated validation record](../adr/0018-request-bound-session-creation-retries.md#local-validation-2026-10-23)
for executed checks and their limits. Production-build integration remains
pending PR #112.
