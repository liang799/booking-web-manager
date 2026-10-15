# /app/payouts

**Owner:** Rishi (rbrishi15)

UC1-07 Set Up Payout Account, through Stripe Connect Express. UC1-08 Withdraw
Funds (session payouts) lands here next.

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

## Configuration

`STRIPE_SECRET_KEY` must be a test-mode key (`sk_test_` / `rk_test_`); a live
key is refused, since live payouts need an ACRA-registered entity (CLAUDE.md,
Out of scope). Without it, or without `DATABASE_URL`, the routes answer
`503 PAYOUTS_UNAVAILABLE`. Connect must be enabled on the Stripe account
(Dashboard → Connect), and the platform must be able to create Singapore
Express accounts.
