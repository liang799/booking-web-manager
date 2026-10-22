import { describe, expect, test } from "vitest";
import {
  FakePayoutAccountProvider,
  FakePayoutTransfers,
} from "@/app/payouts/fake-payout-account-provider";

describe("FakePayoutAccountProvider", () => {
  test("creates a simulated account reference and records request", async () => {
    const provider = new FakePayoutAccountProvider();
    const ref = await provider.createAccount({
      userId: "11111111-2222-4333-8444-555555555555",
      email: "host@example.com",
      idempotencyKey: "test-key-1",
    });

    expect(ref).toBe("acct_simulated_111111112222");
    expect(provider.createdAccounts).toHaveLength(1);
    expect(provider.createdAccounts[0]).toEqual({
      userId: "11111111-2222-4333-8444-555555555555",
      email: "host@example.com",
      idempotencyKey: "test-key-1",
    });
  });

  test("generates an onboarding link redirecting immediately to the return URL", async () => {
    const provider = new FakePayoutAccountProvider();
    const link = await provider.createOnboardingLink("acct_123", {
      returnUrl: "https://booking.test/payouts",
      refreshUrl: "https://booking.test/payouts?onboarding=refresh",
    });

    expect(link).toBe("https://booking.test/payouts?onboarding=return&simulated=true");
  });

  test("appends correctly if returnUrl already contains query parameters", async () => {
    const provider = new FakePayoutAccountProvider();
    const link = await provider.createOnboardingLink("acct_123", {
      returnUrl: "https://booking.test/payouts?tab=settings",
      refreshUrl: "https://booking.test/payouts?onboarding=refresh",
    });

    expect(link).toBe("https://booking.test/payouts?tab=settings&onboarding=return&simulated=true");
  });

  test("reports completed provider account state for created accounts", async () => {
    const provider = new FakePayoutAccountProvider();
    const ref = await provider.createAccount({
      userId: "aaaa1111-bbbb-4ccc-8ddd-eeeeffff0000",
      email: null,
      idempotencyKey: "test-key-2",
    });

    const state = await provider.getAccount(ref);
    expect(state).toEqual({
      accountReference: ref,
      payoutsEnabled: true,
      defaultDestinationReference: "ba_simulated_destination",
      rejected: false,
      instantPayoutsAvailable: true,
    });
  });

  test("returns resilient completed state for unknown account reference", async () => {
    const provider = new FakePayoutAccountProvider();
    const state = await provider.getAccount("acct_random_fallback");
    expect(state.payoutsEnabled).toBe(true);
    expect(state.rejected).toBe(false);
    expect(state.defaultDestinationReference).toBeDefined();
  });
});

describe("FakePayoutTransfers", () => {
  test("creates a simulated transfer and records call", async () => {
    const transfers = new FakePayoutTransfers();
    const ref = await transfers.transfer({
      payoutId: "99998888-7777-4666-8555-444433332222",
      sessionId: "sess-1",
      amountCents: 5000,
      accountReference: "acct_simulated_123",
    });

    expect(ref).toBe("tr_simulated_999988887777");
    expect(transfers.transfers).toHaveLength(1);
    expect(transfers.transfers[0]?.amountCents).toBe(5000);
  });

  test("executes simulated instant payout", async () => {
    const transfers = new FakePayoutTransfers();
    await transfers.instantPayout({
      payoutId: "payout-instant-1",
      amountCents: 2500,
      accountReference: "acct_123",
    });

    expect(transfers.instantPayouts).toHaveLength(1);
    expect(transfers.instantPayouts[0]?.payoutId).toBe("payout-instant-1");
  });
});
