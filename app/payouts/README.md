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
   `Booker.preparePayout` moves the session to `PAYOUT_PENDING` and
   `PayoutAttempt.create` writes a `REQUESTED` row in `payout_attempts`. That
   row is the durable intent; at most one can be open per session.
2. **Transfer** (no transaction): a Stripe transfer to the booker's connected
   account, grouped by `transfer_group = payoutId` and keyed
   `["UC1-08:transfer", payoutId]`. A retry finds the existing transfer before
   creating one, so the booker is never paid twice.
3. **Complete** (one transaction): the attempt completes, the session settles,
   and the ledger records the payout. A decline from Stripe instead fails the
   attempt and returns the session to awaiting payout.
4. **Bank payout**: `INSTANT` (push-to-card) is used only when it was requested
   and the account supports it, and falls back to `STANDARD` if Stripe refuses
   it. The money has already reached the connected account by then.

Retrying with the same idempotency key replays the original result. A retry
after a lost response, even with a new key, resumes the open attempt instead of
starting a second one.

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
