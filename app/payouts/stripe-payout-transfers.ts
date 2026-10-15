import Stripe from "stripe";
import { PayoutProviderError } from "@/use-cases/payouts/SetUpPayoutAccount";
import { PayoutDeclinedError, type PayoutTransfers } from "@/use-cases/payouts/WithdrawSessionPayout";

/**
 * UC1-08 through Stripe Connect. A transfer moves the payout from the platform
 * balance to the booker's Express account; an instant payout then sends it on
 * to their debit card. Without one, Stripe's automatic schedule pays the bank.
 */
export class StripePayoutTransfers implements PayoutTransfers {
  constructor(private readonly stripe: Stripe) {}

  async transfer(request: {
    readonly payoutId: string;
    readonly sessionId: string;
    readonly amountCents: number;
    readonly accountReference: string;
  }): Promise<string> {
    // Stripe forgets idempotency keys after 24 hours; the transfer group (one
    // per payout attempt) finds an earlier transfer however late the retry.
    const existing = await provider(() =>
      this.stripe.transfers.list({ transfer_group: request.payoutId, limit: 1 }),
    );
    const earlier = existing.data[0];
    if (earlier !== undefined) return earlier.id;

    const transfer = await provider(() =>
      this.stripe.transfers.create(
        {
          amount: request.amountCents,
          currency: "sgd",
          destination: request.accountReference,
          transfer_group: request.payoutId,
          metadata: { payout_id: request.payoutId, session_id: request.sessionId },
        },
        { idempotencyKey: JSON.stringify(["UC1-08:transfer", request.payoutId]) },
      ),
    );
    return transfer.id;
  }

  async instantPayout(request: {
    readonly payoutId: string;
    readonly amountCents: number;
    readonly accountReference: string;
  }): Promise<void> {
    await provider(() =>
      this.stripe.payouts.create(
        {
          amount: request.amountCents,
          currency: "sgd",
          method: "instant",
          metadata: { payout_id: request.payoutId },
        },
        {
          stripeAccount: request.accountReference,
          idempotencyKey: JSON.stringify(["UC1-08:instant", request.payoutId]),
        },
      ),
    );
  }
}

/**
 * Stripe refused the request itself (invalid request, permission, card), so no
 * money moved and the attempt can fail. Connection, server, rate-limit and
 * idempotency errors leave the outcome unknown; the attempt stays REQUESTED.
 */
async function provider<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (cause) {
    if (
      cause instanceof Stripe.errors.StripeInvalidRequestError ||
      cause instanceof Stripe.errors.StripePermissionError ||
      cause instanceof Stripe.errors.StripeCardError
    )
      throw new PayoutDeclinedError(cause.code ?? cause.type, { cause });
    if (cause instanceof Stripe.errors.StripeError)
      throw new PayoutProviderError("The payout provider could not complete the request", { cause });
    throw cause;
  }
}
