# UC2-02 idempotency boundary example

This branch illustrates a stricter HTTP retry contract while keeping the
`CreateSessions` use case and domain unchanged.

Read [ADR-0018: Request-bound HTTP session-creation retries](../adr/0018-request-bound-session-creation-retries.md)
for the flow, existing key-only policy, legacy-record compatibility, tests and
validation limits. The proposal is not an approved change to the team contract.

Start with these changes:

1. `app/sessions/request-bound-creation-input.ts`: attach parsed request data as submission metadata.
2. `app/api/sessions/route.ts`: use that API parser wrapper; the use-case call is unchanged.
3. `lib/sessions/postgres-session-creation-transaction.ts`: pass metadata to the existing atomic fingerprint/replay mechanism.
4. `app/sessions/create-session-response.ts`: map request mismatch to a safe 409 response.

Nothing is merged into either repository's main branch.
