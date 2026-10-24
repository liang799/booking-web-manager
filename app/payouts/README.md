# /app/payouts

**Owner:** Rishi (rbrishi15)

UC1-07 Set Up Payout Account and UC1-08 Withdraw Funds, through Stripe Connect
Express.

A booker needs a **completed payout account before creating a session**
(`Booker.assertCanCreateSession`), because settled shares are paid out to it.
Stripe hosts identity verification and collects the bank account or debit
card; this system stores only Stripe's account reference and the destination
reference Stripe reports, in `payout_accounts`.

## Flow

1. `/payouts` page → `POST /api/payouts/account`. The use case creates a Stripe
   Express account (country SG, `transfers` capability) or reuses the pending
   one, records it through `User.beginPayoutSetup`, and returns a single-use
   Stripe onboarding link. The page redirects to it.
2. Stripe returns the user to `/payouts?onboarding=return`, or to
   `?onboarding=refresh` when the link expired (the page fetches a new one and
   sends them straight back).
3. Setup completes through `User.completePayoutSetup` once Stripe reports
   `payouts_enabled` with a default destination. Either path does it:
   - **Push:** the `account.updated` webhook (`/app/api/webhooks`).
   - **Pull:** `GET /api/payouts/account` refreshes a pending setup from
     Stripe, so a missed or unconfigured webhook cannot leave it stuck.

A rejected account (`requirements.disabled_reason` = `rejected.*`) becomes
`FAILED`; starting again creates a new Stripe account. A completed destination
is never replaced (domain rule). `instantPayoutsAvailable` reports push-to-card
eligibility: the default destination is a debit card whose
`available_payout_methods` include `instant`.

Every Stripe call happens outside a database transaction (rule #4). Account
creation uses the idempotency key `["UC1-07", userId, "first" | failedAccount]`,
so a double-click cannot create two Stripe accounts.

| Layer | File |
| --- | --- |
| Use case | [`use-cases/payouts/SetUpPayoutAccount.ts`](../../use-cases/payouts/SetUpPayoutAccount.ts) |
| Persistence | [`lib/payouts/postgres-payout-setup-store.ts`](../../lib/payouts/postgres-payout-setup-store.ts) |
| Stripe adapter | [`stripe-payout-account-provider.ts`](./stripe-payout-account-provider.ts) |
| Route | [`app/api/payouts/account/route.ts`](../api/payouts/account/route.ts) |
| Assembly | [`use-case-config/payouts.ts`](../../use-case-config/payouts.ts) |

## UC1-08 Withdraw Funds

A booker withdraws a session's settled shares once attendance is verified.
`GET /api/payouts/sessions` lists the booker's sessions that are awaiting
payout, pending or settled; `POST /api/payouts/withdraw` pays one out.

1. **Prepare** (one transaction, key `["UC1-08:prepare", bookerId, sessionId, key]`):
   the application unit of work stores or replays the original preparation.
   `Booker.preparePayout(session, { payoutId, now })` moves the session to
   `PAYOUT_PENDING`, and `PayoutAttempt.create` writes a `REQUESTED` row.
   At most one attempt can be open per session. Request keys belong to the
   adapters; domain objects contain payout IDs and business state only.
2. **Check for a terminal result** (fresh transaction): load and authorize
   Session, then lock PayoutAttempt. A failed attempt returns its recorded
   decline; a completed attempt returns its immutable receipt. Neither calls
   Stripe. A pending attempt continues using its original payout ID.
3. **Transfer** (no transaction): a Stripe transfer to the booker's connected
   account, grouped by `transfer_group = payoutId` and keyed
   `["UC1-08:transfer", payoutId]`. Provider idempotency prevents duplicate
   transfers when concurrent calls both observed the pending attempt.
4. **Complete or fail** (fresh transaction): completion settles the session
   and appends the settlement and payout ledger entries. A definitive decline
   instead fails the attempt, reopens the session and stores its decline
   receipt atomically. The transaction step key determines ledger identity;
   it never caches the callback's return value.
5. **Bank payout** (no transaction): only the invocation that newly completed
   the attempt may initiate this step. `INSTANT` is used when requested and
   eligible; provider refusal falls back to `STANDARD`. The invocation stores
   its result if absent under `["UC1-08:result", payoutId]` and returns the
   canonical receipt. All requests that resumed that attempt share it.

Retrying the same request replays its recorded terminal outcome without another
provider call or ledger entry. A lost transfer response leaves the attempt
pending; either the same key or a new key resumes it. A new key after a
recorded decline creates a new attempt.

A completed attempt without a receipt is recovered as `PAID` with `bankPayout`
omitted. The UI confirms success without guessing the bank method. Recovery
favors avoiding another payment: if execution stops before the instant step,
the bank payout may fall back to Stripe's standard schedule. If recovery stores
its receipt before the completion winner finishes, that immutable receipt is
returned by both invocations.

The preparation namespace, stored response shape, database key columns and
pending-settlement JSON remain compatible with existing records. No migration
or backfill is needed; legacy keys are validated and retained privately by the
adapters. See [ADR-0020](../../docs/adr/0020-payout-request-idempotency.md).

| Layer | File |
| --- | --- |
| Use cases | [`WithdrawSessionPayout.ts`](../../use-cases/payouts/WithdrawSessionPayout.ts), [`ListSessionPayouts.ts`](../../use-cases/payouts/ListSessionPayouts.ts) |
| Persistence | [`lib/payouts/`](../../lib/payouts/), migration [`0012_payout_attempts.sql`](../../supabase/migrations/0012_payout_attempts.sql) |
| Stripe adapter | [`stripe-payout-transfers.ts`](./stripe-payout-transfers.ts) |
| Routes | [`app/api/payouts/sessions`](../api/payouts/sessions/route.ts), [`app/api/payouts/withdraw`](../api/payouts/withdraw/route.ts) |

## Configuration

`STRIPE_SECRET_KEY` must be a test-mode key (`sk_test_` / `rk_test_`); a live
key is refused, since live payouts need an ACRA-registered entity (CLAUDE.md,
Out of scope). Without it, or without `DATABASE_URL`, the routes answer
`503 PAYOUTS_UNAVAILABLE`. Connect must be enabled on the Stripe account
(Dashboard → Connect), and the platform must be able to create Singapore
Express accounts.
