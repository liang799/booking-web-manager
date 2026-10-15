import type Stripe from "stripe";
import { describe, expect, test } from "vitest";
import { readStripeSettings } from "@/app/payouts/stripe-client";
import { stripeAccountState } from "@/app/payouts/stripe-payout-account-provider";

describe("readStripeSettings", () => {
  test("leaves payments unavailable without a secret key", () => {
    // Act & Assert
    expect(readStripeSettings({})).toBeUndefined();
  });

  test("leaves payments unavailable for a placeholder key", () => {
    // Act & Assert
    expect(readStripeSettings({ STRIPE_SECRET_KEY: "mock-local" })).toBeUndefined();
  });

  test("refuses a live-mode key", () => {
    // Act & Assert
    expect(() => readStripeSettings({ STRIPE_SECRET_KEY: "sk_live_abc" })).toThrow("live-mode");
    expect(() => readStripeSettings({ STRIPE_SECRET_KEY: "rk_live_abc" })).toThrow("live-mode");
  });

  test("returns a test-mode key with every configured signing secret", () => {
    // Act
    const settings = readStripeSettings({
      STRIPE_SECRET_KEY: " sk_test_abc ",
      STRIPE_WEBHOOK_SECRET: "whsec_platform",
      STRIPE_CONNECT_WEBHOOK_SECRET: " ",
    });

    // Assert
    expect(settings).toEqual({ secretKey: "sk_test_abc", webhookSecrets: ["whsec_platform"] });
  });
});

describe("stripeAccountState", () => {
  test("reports a verified account paying out to a bank account", () => {
    // Act
    const state = stripeAccountState(account({ payouts_enabled: true, destinations: [bank("ba_1", true)] }));

    // Assert
    expect(state).toEqual({
      accountReference: "acct_1",
      payoutsEnabled: true,
      defaultDestinationReference: "ba_1",
      rejected: false,
      instantPayoutsAvailable: false,
    });
  });

  test("reports push-to-card eligibility for a default debit card supporting instant payouts", () => {
    // Act
    const state = stripeAccountState(
      account({ payouts_enabled: true, destinations: [bank("ba_1", false), card("card_1", ["standard", "instant"])] }),
    );

    // Assert
    expect(state.defaultDestinationReference).toBe("card_1");
    expect(state.instantPayoutsAvailable).toBe(true);
  });

  test("does not offer instant payouts to a card limited to standard payouts", () => {
    // Act
    const state = stripeAccountState(account({ payouts_enabled: true, destinations: [card("card_1", ["standard"])] }));

    // Assert
    expect(state.instantPayoutsAvailable).toBe(false);
  });

  test("reports an account Stripe rejected", () => {
    // Act
    const state = stripeAccountState(account({ payouts_enabled: false, disabled_reason: "rejected.fraud" }));

    // Assert
    expect(state.rejected).toBe(true);
    expect(state.defaultDestinationReference).toBeUndefined();
  });

  test("does not treat an account awaiting details as rejected", () => {
    // Act
    const state = stripeAccountState(account({ payouts_enabled: false, disabled_reason: "requirements.past_due" }));

    // Assert
    expect(state.rejected).toBe(false);
  });
});

function account(options: {
  payouts_enabled: boolean;
  destinations?: unknown[];
  disabled_reason?: string;
}): Stripe.Account {
  return {
    id: "acct_1",
    object: "account",
    payouts_enabled: options.payouts_enabled,
    external_accounts: { object: "list", data: options.destinations ?? [], has_more: false, url: "" },
    requirements: { disabled_reason: options.disabled_reason ?? null },
  } as unknown as Stripe.Account;
}

function bank(id: string, isDefault: boolean) {
  return { id, object: "bank_account", currency: "sgd", default_for_currency: isDefault };
}

function card(id: string, methods: string[]) {
  return { id, object: "card", currency: "sgd", default_for_currency: true, available_payout_methods: methods };
}
