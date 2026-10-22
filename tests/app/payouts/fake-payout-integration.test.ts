import { describe, expect, test } from "vitest";
import { Email, type UUID } from "@/domain";
import { FakePayoutAccountProvider } from "@/app/payouts/fake-payout-account-provider";
import { SetUpPayoutAccount, type PayoutSetupStore } from "@/use-cases/payouts/SetUpPayoutAccount";
import { createTestUser } from "../../domain/accounts/user-fixtures";
import type { User } from "@/domain";

class InMemorySetupStore implements PayoutSetupStore {
  userRecord: User;

  constructor(user: User) {
    this.userRecord = user;
  }

  async forUser<T>(_userId: UUID, work: (user: User) => T): Promise<T> {
    return work(this.userRecord);
  }

  async forProviderAccount(): Promise<never> {
    throw new Error("Not used in this test");
  }
}

describe("FakePayoutAccountProvider integration with SetUpPayoutAccount", () => {
  const userId = "22222222-3333-4444-8555-666666666666";

  test("seamlessly onboards user to COMPLETE without external Stripe dependency", async () => {
    const user = createTestUser({ userId, email: new Email("booker@example.com") });
    const store = new InMemorySetupStore(user);
    const fakeProvider = new FakePayoutAccountProvider();

    const setup = new SetUpPayoutAccount({
      store,
      provider: fakeProvider,
      ids: { next: () => "payout-acc-id-1" },
    });

    // 1. Initial status is NOT_STARTED
    const initialStatus = await setup.status(userId);
    expect(initialStatus.status).toBe("NOT_STARTED");
    expect(user.payoutAccount).toBeUndefined();

    // 2. User starts payout setup
    const startResult = await setup.start(userId, {
      returnUrl: "https://booking.test/payouts",
      refreshUrl: "https://booking.test/payouts?onboarding=refresh",
    });

    expect(startResult.status).toBe("PENDING");
    expect(startResult.onboardingUrl).toBe("https://booking.test/payouts?onboarding=return&simulated=true");
    expect(user.payoutAccount?.setupStatus).toBe("PENDING");
    expect(user.payoutAccount?.providerAccountReference).toMatch(/^acct_simulated_/);

    // 3. Status refresh (triggered when page reloads at returnUrl) immediately completes the setup
    const completedStatus = await setup.status(userId);
    expect(completedStatus.status).toBe("COMPLETE");
    expect(completedStatus.instantPayoutsAvailable).toBe(true);
    expect(user.payoutAccount?.setupStatus).toBe("COMPLETE");
    expect(user.payoutAccount?.bankAccountReference).toBe("ba_simulated_destination");

    // 4. Booker is now permitted to create sessions!
    expect(() => user.asBooker().assertCanCreateSession()).not.toThrow();
  });
});
