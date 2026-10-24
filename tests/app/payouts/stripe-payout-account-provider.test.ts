import Stripe from "stripe";
import { afterEach, describe, expect, test, vi } from "vitest";
import { StripePayoutAccountProvider } from "@/app/payouts/stripe-payout-account-provider";
import { PayoutProviderError } from "@/use-cases/payouts/SetUpPayoutAccount";

const request = { userId: "user-1", email: "booker@example.com", idempotencyKey: '["UC1-07","user-1","first"]' };

afterEach(() => vi.restoreAllMocks());

describe("StripePayoutAccountProvider.createAccount", () => {
  test("creates an Express account under the request's key", async () => {
    // Arrange
    const { stripe, create } = fakeStripe([{ id: "acct_new" }]);

    // Act
    const reference = await new StripePayoutAccountProvider(stripe).createAccount(request);

    // Assert
    expect(reference).toBe("acct_new");
    expect(create).toHaveBeenCalledWith(
      {
        type: "express",
        country: "SG",
        business_type: "individual",
        email: "booker@example.com",
        capabilities: { transfers: { requested: true } },
        metadata: { user_id: "user-1" },
      },
      { idempotencyKey: request.idempotencyKey },
    );
  });

  test("continues past a refusal Stripe replays from its idempotency cache", async () => {
    // Arrange
    silenceLogs();
    const { stripe, create } = fakeStripe([refusal({ replayedFrom: "req_refused" }), { id: "acct_new" }]);

    // Act
    const reference = await new StripePayoutAccountProvider(stripe).createAccount(request);

    // Assert
    expect(reference).toBe("acct_new");
    expect(create.mock.calls.map(([, options]) => options?.idempotencyKey)).toEqual([
      request.idempotencyKey,
      JSON.stringify([request.idempotencyKey, "after", "req_refused"]),
    ]);
  });

  test("derives the same follow-up key for concurrent requests", async () => {
    // Arrange
    silenceLogs();
    const first = fakeStripe([refusal({ replayedFrom: "req_refused" }), { id: "acct_new" }]);
    const second = fakeStripe([refusal({ replayedFrom: "req_refused" }), { id: "acct_new" }]);

    // Act
    await new StripePayoutAccountProvider(first.stripe).createAccount(request);
    await new StripePayoutAccountProvider(second.stripe).createAccount(request);

    // Assert
    expect(first.create.mock.calls[1]?.[1]).toEqual(second.create.mock.calls[1]?.[1]);
  });

  test.each([
    ["a refusal made by this request", refusal({})],
    ["a replayed server error, whose outcome is unknown", refusal({ replayedFrom: "req_500", statusCode: 500 })],
    ["a replay without its original request", refusal({ replayedFrom: "" })],
  ])("reports %s without retrying", async (_case, failure) => {
    // Arrange
    silenceLogs();
    const { stripe, create } = fakeStripe([failure]);

    // Act & Assert
    await expect(new StripePayoutAccountProvider(stripe).createAccount(request)).rejects.toBeInstanceOf(PayoutProviderError);
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("stops after repeated replayed refusals", async () => {
    // Arrange
    silenceLogs();
    const { stripe, create } = fakeStripe(
      ["req_a", "req_b", "req_c", "req_d", "req_e"].map((id) => refusal({ replayedFrom: id })),
    );

    // Act & Assert
    await expect(new StripePayoutAccountProvider(stripe).createAccount(request)).rejects.toBeInstanceOf(PayoutProviderError);
    expect(create).toHaveBeenCalledTimes(4);
  });
});

function refusal({ replayedFrom, statusCode = 400 }: { replayedFrom?: string; statusCode?: number }) {
  const headers: Record<string, string> = replayedFrom === undefined
    ? {}
    : { "idempotent-replayed": "true", "original-request": replayedFrom };
  return new Stripe.errors.StripeInvalidRequestError({
    type: "invalid_request_error",
    message: "Stripe refused the request",
    statusCode,
    headers,
  });
}

function fakeStripe(outcomes: readonly (Error | { id: string })[]) {
  let call = 0;
  const create = vi.fn<(params: Stripe.AccountCreateParams, options?: Stripe.RequestOptions) => Promise<{ id: string }>>(async () => {
    const outcome = outcomes[call++];
    if (outcome === undefined) throw new Error("unexpected call");
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
  return { stripe: { accounts: { create } } as unknown as Stripe, create };
}

function silenceLogs() {
  vi.spyOn(console, "error").mockImplementation(() => {});
}
