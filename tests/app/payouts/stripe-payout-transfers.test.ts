import Stripe from "stripe";
import { describe, expect, test, vi } from "vitest";
import { StripePayoutTransfers } from "@/app/payouts/stripe-payout-transfers";
import { PayoutProviderError } from "@/use-cases/payouts/SetUpPayoutAccount";
import { PayoutDeclinedError } from "@/use-cases/payouts/WithdrawSessionPayout";

const request = { payoutId: "payout-1", sessionId: "s", amountCents: 1000, accountReference: "acct_1" };

describe("StripePayoutTransfers", () => {
  test("transfers the payout to the booker's account, keyed and grouped by payout", async () => {
    // Arrange
    const { stripe, create } = fakeStripe({ existing: [] });

    // Act
    const reference = await new StripePayoutTransfers(stripe).transfer(request);

    // Assert
    expect(reference).toBe("tr_new");
    expect(create).toHaveBeenCalledWith(
      {
        amount: 1000,
        currency: "sgd",
        destination: "acct_1",
        transfer_group: "payout-1",
        metadata: { payout_id: "payout-1", session_id: "s" },
      },
      { idempotencyKey: '["UC1-08:transfer","payout-1"]' },
    );
  });

  test("reuses an earlier transfer for the same payout instead of paying twice", async () => {
    // Arrange
    const { stripe, create } = fakeStripe({ existing: [{ id: "tr_earlier" }] });

    // Act
    const reference = await new StripePayoutTransfers(stripe).transfer(request);

    // Assert
    expect(reference).toBe("tr_earlier");
    expect(create).not.toHaveBeenCalled();
  });

  test("reports a refusal Stripe made itself as a decline", async () => {
    // Arrange
    const refusal = new Stripe.errors.StripeInvalidRequestError({
      type: "invalid_request_error",
      code: "balance_insufficient",
      message: "Insufficient funds",
    });
    const { stripe } = fakeStripe({ existing: [], createFailure: refusal });

    // Act & Assert
    await expect(new StripePayoutTransfers(stripe).transfer(request)).rejects.toMatchObject({
      name: "PayoutDeclinedError",
      reason: "balance_insufficient",
    });
  });

  test("treats a connection failure as unknown, never as a decline", async () => {
    // Arrange
    const lost = new Stripe.errors.StripeConnectionError({ type: "api_error", message: "socket hang up" });
    const { stripe } = fakeStripe({ existing: [], createFailure: lost });

    // Act
    const failure = await new StripePayoutTransfers(stripe).transfer(request).catch((error: unknown) => error);

    // Assert
    expect(failure).toBeInstanceOf(PayoutProviderError);
    expect(failure).not.toBeInstanceOf(PayoutDeclinedError);
  });

  test("sends an instant payout from the connected account to its debit card", async () => {
    // Arrange
    const { stripe, payout } = fakeStripe({ existing: [] });

    // Act
    await new StripePayoutTransfers(stripe).instantPayout(request);

    // Assert
    expect(payout).toHaveBeenCalledWith(
      { amount: 1000, currency: "sgd", method: "instant", metadata: { payout_id: "payout-1" } },
      { stripeAccount: "acct_1", idempotencyKey: '["UC1-08:instant","payout-1"]' },
    );
  });
});

function fakeStripe(options: { existing: { id: string }[]; createFailure?: Error }) {
  const create = vi.fn(async () => {
    if (options.createFailure) throw options.createFailure;
    return { id: "tr_new" };
  });
  const list = vi.fn(async () => ({ data: options.existing }));
  const payout = vi.fn(async () => ({ id: "po_1" }));
  const stripe = { transfers: { create, list }, payouts: { create: payout } } as unknown as Stripe;
  return { stripe, create, list, payout };
}
