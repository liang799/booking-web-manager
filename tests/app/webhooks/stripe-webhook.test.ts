import Stripe from "stripe";
import { describe, expect, test, vi } from "vitest";
import { accountUpdatedHandler } from "@/app/api/webhooks/payout-account-events";
import {
  createStripeEventVerifier,
  handleStripeWebhook,
  type StripeWebhookDependencies,
} from "@/app/api/webhooks/stripe-webhook";
import type { ProviderAccountState } from "@/use-cases/payouts/SetUpPayoutAccount";

// Signatures are generated and checked locally; no request reaches Stripe.
const stripe = new Stripe("sk_test_offline");
const platformSecret = "whsec_platform";
const connectSecret = "whsec_connect";

describe("Stripe webhook endpoint", () => {
  test("answers 503 when webhooks are not configured", async () => {
    // Act
    const response = await handleStripeWebhook(signedRequest(event("account.updated")), undefined);

    // Assert
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "WEBHOOKS_UNAVAILABLE", message: "Stripe webhooks are not configured" },
    });
  });

  test("rejects a request without a Stripe-Signature header", async () => {
    // Arrange
    const request = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: JSON.stringify(event("account.updated")),
    });

    // Act
    const response = await handleStripeWebhook(request, dependencies({}));

    // Assert
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("MISSING_SIGNATURE");
  });

  test("rejects a payload signed with an unknown secret", async () => {
    // Arrange
    const handler = vi.fn(async () => {});
    const request = signedRequest(event("account.updated"), "whsec_attacker");

    // Act
    const response = await handleStripeWebhook(request, dependencies({ "account.updated": handler }));

    // Assert
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_SIGNATURE");
    expect(handler).not.toHaveBeenCalled();
  });

  test("rejects a payload altered after it was signed", async () => {
    // Arrange
    const handler = vi.fn(async () => {});
    const payload = JSON.stringify(event("account.updated"));
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: platformSecret });
    const request = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: payload.replace("acct_1", "acct_2"),
    });

    // Act
    const response = await handleStripeWebhook(request, dependencies({ "account.updated": handler }));

    // Assert
    expect(response.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  test("passes an event signed with the connected-account secret to its handler", async () => {
    // Arrange
    const handler = vi.fn(async () => {});

    // Act
    const response = await handleStripeWebhook(
      signedRequest(event("account.updated"), connectSecret),
      dependencies({ "account.updated": handler }),
    );

    // Assert
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: "evt_1", type: "account.updated" }));
  });

  test("acknowledges event types it does not handle", async () => {
    // Act
    const response = await handleStripeWebhook(signedRequest(event("customer.created")), dependencies({}));

    // Assert
    expect(response.status).toBe(200);
  });

  test("answers 500 when the handler fails, so Stripe retries", async () => {
    // Arrange
    vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = vi.fn(async () => {
      throw new Error("database unavailable");
    });

    // Act
    const response = await handleStripeWebhook(
      signedRequest(event("account.updated")),
      dependencies({ "account.updated": handler }),
    );

    // Assert
    expect(response.status).toBe(500);
    expect((await response.json()).error).toEqual({
      code: "WEBHOOK_FAILED",
      message: "The event could not be processed",
    });
  });
});

describe("account.updated handler", () => {
  test("reads the account fresh from Stripe and applies it under the event's ID", async () => {
    // Arrange
    const state: ProviderAccountState = {
      accountReference: "acct_1",
      payoutsEnabled: true,
      defaultDestinationReference: "ba_1",
      rejected: false,
      instantPayoutsAvailable: false,
    };
    const accounts = { getAccount: vi.fn(async () => state) };
    const payoutSetup = { applyProviderUpdate: vi.fn(async () => "COMPLETE" as const) };
    const handler = accountUpdatedHandler(accounts, payoutSetup);

    // Act
    await handler(event("account.updated"));

    // Assert
    expect(accounts.getAccount).toHaveBeenCalledWith("acct_1");
    expect(payoutSetup.applyProviderUpdate).toHaveBeenCalledWith(
      { eventId: "evt_1", eventType: "account.updated" },
      state,
    );
  });

  test("ignores other event types", async () => {
    // Arrange
    const accounts = { getAccount: vi.fn() };
    const payoutSetup = { applyProviderUpdate: vi.fn() };
    const handler = accountUpdatedHandler(accounts, payoutSetup);

    // Act
    await handler(event("customer.created"));

    // Assert
    expect(accounts.getAccount).not.toHaveBeenCalled();
    expect(payoutSetup.applyProviderUpdate).not.toHaveBeenCalled();
  });
});

function dependencies(
  handlers: StripeWebhookDependencies["handlers"],
): StripeWebhookDependencies {
  return { verify: createStripeEventVerifier(stripe, [platformSecret, connectSecret]), handlers };
}

function event(type: string): Stripe.Event {
  return {
    id: "evt_1",
    object: "event",
    type,
    account: "acct_1",
    api_version: "2025-02-24.acacia",
    created: 1_790_000_000,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object: { id: "acct_1", object: "account" } },
  } as unknown as Stripe.Event;
}

function signedRequest(body: Stripe.Event, secret = platformSecret): Request {
  const payload = JSON.stringify(body);
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: {
      "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret }),
    },
    body: payload,
  });
}
