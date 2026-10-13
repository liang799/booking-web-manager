import { describe, expect, test } from "vitest";
import { DomainError, PayoutAccount, type User } from "@/domain";
import {
  PayoutProviderError,
  SetUpPayoutAccount,
  type OnboardingLinks,
  type PayoutAccountProvider,
  type PayoutSetupStore,
  type ProviderAccountState,
  type ProviderEvent,
  type ProviderEventOutcome,
} from "@/use-cases/payouts/SetUpPayoutAccount";
import { createTestUser } from "../domain/accounts/user-fixtures";

const links: OnboardingLinks = {
  returnUrl: "https://app.test/payouts?onboarding=return",
  refreshUrl: "https://app.test/payouts?onboarding=refresh",
};

// Owner: Rishi (rbrishi15) — /app/payouts
describe("UC1-07 Set Up Payout Account", () => {
  describe("starting setup", () => {
    test("creates a Stripe Express account and returns its onboarding link", async () => {
      // Arrange
      const { setUp, store, stripe } = scenario(createTestUser({ userId: "alice" }));

      // Act
      const view = await setUp.start("alice", links);

      // Assert
      expect(view).toEqual({ status: "PENDING", onboardingUrl: "https://connect.stripe.test/acct_1" });
      expect(stripe.created).toEqual([
        { userId: "alice", email: "alice@example.com", idempotencyKey: '["UC1-07","alice","first"]' },
      ]);
      expect(stripe.linkRequests).toEqual([{ accountReference: "acct_1", links }]);
      expect(store.user("alice").payoutAccount?.setupStatus).toBe("PENDING");
      expect(store.user("alice").payoutAccount?.providerAccountReference).toBe("acct_1");
    });

    test("resumes a pending setup with a fresh link, without creating a second account", async () => {
      // Arrange
      const { setUp, stripe } = scenario(userWithSetup("alice", "PENDING", "acct_existing"));

      // Act
      const view = await setUp.start("alice", links);

      // Assert
      expect(view.onboardingUrl).toBe("https://connect.stripe.test/acct_existing");
      expect(stripe.created).toHaveLength(0);
    });

    test("returns a completed setup unchanged, without contacting Stripe", async () => {
      // Arrange
      const { setUp, stripe } = scenario(userWithSetup("alice", "COMPLETE", "acct_done", "ba_1"));

      // Act
      const view = await setUp.start("alice", links);

      // Assert
      expect(view).toEqual({ status: "COMPLETE" });
      expect(stripe.created).toHaveLength(0);
      expect(stripe.linkRequests).toHaveLength(0);
    });

    test("starts a new account after a failed setup", async () => {
      // Arrange
      const { setUp, store, stripe } = scenario(userWithSetup("alice", "FAILED", "acct_rejected"));

      // Act
      const view = await setUp.start("alice", links);

      // Assert
      expect(view.status).toBe("PENDING");
      expect(stripe.created[0]?.idempotencyKey).toBe('["UC1-07","alice","acct_rejected"]');
      expect(store.user("alice").payoutAccount?.providerAccountReference).toBe("acct_1");
      expect(store.user("alice").payoutAccount?.setupStatus).toBe("PENDING");
    });

    test("rejects an inactive account before contacting Stripe", async () => {
      // Arrange
      const { setUp, stripe } = scenario(createTestUser({ userId: "alice", accountStatus: "INACTIVE" }));

      // Act & Assert
      await expect(setUp.start("alice", links)).rejects.toMatchObject({ code: "INACTIVE_ACCOUNT" });
      expect(stripe.created).toHaveLength(0);
    });

    test("continues with the setup another request recorded while Stripe was creating the account", async () => {
      // Arrange
      const { setUp, store, stripe } = scenario(createTestUser({ userId: "alice" }));
      stripe.duringCreate = () =>
        store.user("alice").beginPayoutSetup({ payoutAccountId: "pa-other", providerAccountReference: "acct_other" });

      // Act
      const view = await setUp.start("alice", links);

      // Assert
      expect(view.onboardingUrl).toBe("https://connect.stripe.test/acct_other");
      expect(store.user("alice").payoutAccount?.providerAccountReference).toBe("acct_other");
    });

    test("records nothing when Stripe cannot create the account", async () => {
      // Arrange
      const { setUp, store, stripe } = scenario(createTestUser({ userId: "alice" }));
      stripe.unreachable = true;

      // Act & Assert
      await expect(setUp.start("alice", links)).rejects.toBeInstanceOf(PayoutProviderError);
      expect(store.user("alice").payoutAccount).toBeUndefined();
    });
  });

  describe("checking status", () => {
    test("reports NOT_STARTED when no setup exists", async () => {
      // Arrange
      const { setUp } = scenario(createTestUser({ userId: "alice" }));

      // Act
      const view = await setUp.status("alice");

      // Assert
      expect(view).toEqual({ status: "NOT_STARTED" });
    });

    test("completes a pending setup once Stripe enables payouts, which lets the user create sessions", async () => {
      // Arrange
      const { setUp, store, stripe } = scenario(userWithSetup("alice", "PENDING", "acct_1"));
      stripe.accounts.set("acct_1", ready("acct_1", "ba_1"));

      // Act
      const view = await setUp.status("alice");

      // Assert
      expect(view).toEqual({ status: "COMPLETE", instantPayoutsAvailable: false });
      expect(store.user("alice").payoutAccount?.setupStatus).toBe("COMPLETE");
      expect(store.user("alice").payoutAccount?.bankAccountReference).toBe("ba_1");
      expect(() => store.user("alice").asBooker().assertCanCreateSession()).not.toThrow();
    });

    test("keeps a pending setup pending while Stripe still needs details", async () => {
      // Arrange
      const { setUp, store, stripe } = scenario(userWithSetup("alice", "PENDING", "acct_1"));
      stripe.accounts.set("acct_1", pending("acct_1"));

      // Act
      const view = await setUp.status("alice");

      // Assert
      expect(view).toEqual({ status: "PENDING" });
      expect(store.user("alice").payoutAccount?.setupStatus).toBe("PENDING");
    });

    test("fails a pending setup that Stripe rejected", async () => {
      // Arrange
      const { setUp, store, stripe } = scenario(userWithSetup("alice", "PENDING", "acct_1"));
      stripe.accounts.set("acct_1", { ...pending("acct_1"), rejected: true });

      // Act
      const view = await setUp.status("alice");

      // Assert
      expect(view).toEqual({ status: "FAILED" });
      expect(store.user("alice").payoutAccount?.setupStatus).toBe("FAILED");
    });

    test("reports the stored status when Stripe cannot be reached", async () => {
      // Arrange
      const { setUp, store, stripe } = scenario(userWithSetup("alice", "PENDING", "acct_1"));
      stripe.unreachable = true;

      // Act
      const view = await setUp.status("alice");

      // Assert
      expect(view).toEqual({ status: "PENDING" });
      expect(store.user("alice").payoutAccount?.setupStatus).toBe("PENDING");
    });

    test("reports push-to-card eligibility for a completed setup paying out to a debit card", async () => {
      // Arrange
      const { setUp, stripe } = scenario(userWithSetup("alice", "COMPLETE", "acct_1", "card_1"));
      stripe.accounts.set("acct_1", { ...ready("acct_1", "card_1"), instantPayoutsAvailable: true });

      // Act
      const view = await setUp.status("alice");

      // Assert
      expect(view).toEqual({ status: "COMPLETE", instantPayoutsAvailable: true });
    });
  });

  describe("account.updated notifications", () => {
    test("completes the setup named by the notification", async () => {
      // Arrange
      const { setUp, store } = scenario(userWithSetup("alice", "PENDING", "acct_1"));

      // Act
      const outcome = await setUp.applyProviderUpdate(accountUpdated("evt_1"), ready("acct_1", "ba_1"));

      // Assert
      expect(outcome).toBe("COMPLETE");
      expect(store.user("alice").payoutAccount?.bankAccountReference).toBe("ba_1");
    });

    test("applies a redelivered notification only once", async () => {
      // Arrange
      const { setUp } = scenario(userWithSetup("alice", "PENDING", "acct_1"));
      await setUp.applyProviderUpdate(accountUpdated("evt_1"), ready("acct_1", "ba_1"));

      // Act
      const outcome = await setUp.applyProviderUpdate(accountUpdated("evt_1"), ready("acct_1", "ba_1"));

      // Assert
      expect(outcome).toBe("DUPLICATE");
    });

    test("acknowledges a notification for an account it never recorded", async () => {
      // Arrange
      const { setUp, store } = scenario(createTestUser({ userId: "alice" }));

      // Act
      const outcome = await setUp.applyProviderUpdate(accountUpdated("evt_1"), ready("acct_unknown", "ba_1"));

      // Assert
      expect(outcome).toBe("UNKNOWN_ACCOUNT");
      expect(store.processedEvents).toHaveLength(0);
    });

    test("never replaces a completed payout destination", async () => {
      // Arrange
      const { setUp, store } = scenario(userWithSetup("alice", "COMPLETE", "acct_1", "ba_1"));

      // Act
      const outcome = await setUp.applyProviderUpdate(accountUpdated("evt_2"), ready("acct_1", "ba_2"));

      // Assert
      expect(outcome).toBe("COMPLETE");
      expect(store.user("alice").payoutAccount?.bankAccountReference).toBe("ba_1");
    });
  });
});

function scenario(...users: User[]) {
  const store = new InMemoryPayoutSetupStore(users);
  const stripe = new FakeStripeConnect();
  let id = 0;
  const setUp = new SetUpPayoutAccount({
    store,
    provider: stripe,
    ids: { next: () => `pa-${(id += 1)}` },
  });
  return { setUp, store, stripe };
}

function userWithSetup(
  userId: string,
  setupStatus: "PENDING" | "COMPLETE" | "FAILED",
  providerAccountReference: string,
  bankAccountReference?: string,
): User {
  return createTestUser({
    userId,
    payoutAccount: new PayoutAccount({
      payoutAccountId: `pa-${userId}`,
      userId,
      providerAccountReference,
      setupStatus,
      bankAccountReference,
    }),
  });
}

function pending(accountReference: string): ProviderAccountState {
  return { accountReference, payoutsEnabled: false, rejected: false, instantPayoutsAvailable: false };
}

function ready(accountReference: string, destination: string): ProviderAccountState {
  return {
    accountReference,
    payoutsEnabled: true,
    defaultDestinationReference: destination,
    rejected: false,
    instantPayoutsAvailable: false,
  };
}

function accountUpdated(eventId: string): ProviderEvent {
  return { eventId, eventType: "account.updated" };
}

/** Real User aggregates in memory; the Postgres adapter adds the transaction and row locks. */
class InMemoryPayoutSetupStore implements PayoutSetupStore {
  readonly #users = new Map<string, User>();
  readonly processedEvents: string[] = [];

  constructor(users: readonly User[]) {
    for (const user of users) this.#users.set(user.userId, user);
  }

  user(userId: string): User {
    const user = this.#users.get(userId);
    if (user === undefined) throw new Error(`No user ${userId}`);
    return user;
  }

  async forUser<T>(userId: string, work: (user: User) => T): Promise<T> {
    const user = this.#users.get(userId);
    if (user === undefined) throw new DomainError("NOT_FOUND", "The profile was not found");
    return work(user);
  }

  async forProviderAccount<T>(
    accountReference: string,
    event: ProviderEvent,
    work: (user: User) => T,
  ): Promise<ProviderEventOutcome<T>> {
    const user = [...this.#users.values()].find(
      (candidate) => candidate.payoutAccount?.providerAccountReference === accountReference,
    );
    if (user === undefined) return { kind: "UNKNOWN_ACCOUNT" };
    if (this.processedEvents.includes(event.eventId)) return { kind: "DUPLICATE" };
    this.processedEvents.push(event.eventId);
    return { kind: "APPLIED", result: work(user) };
  }
}

class FakeStripeConnect implements PayoutAccountProvider {
  readonly created: { userId: string; email: string | null; idempotencyKey: string }[] = [];
  readonly linkRequests: { accountReference: string; links: OnboardingLinks }[] = [];
  readonly accounts = new Map<string, ProviderAccountState>();
  unreachable = false;
  /** Simulates a concurrent request finishing while this account is being created. */
  duringCreate?: () => void;

  async createAccount(request: { userId: string; email: string | null; idempotencyKey: string }) {
    if (this.unreachable) throw new PayoutProviderError("Stripe unreachable");
    this.created.push({ ...request });
    this.duringCreate?.();
    const accountReference = `acct_${this.created.length}`;
    this.accounts.set(accountReference, pending(accountReference));
    return accountReference;
  }

  async createOnboardingLink(accountReference: string, requested: OnboardingLinks) {
    this.linkRequests.push({ accountReference, links: requested });
    return `https://connect.stripe.test/${accountReference}`;
  }

  async getAccount(accountReference: string) {
    if (this.unreachable) throw new PayoutProviderError("Stripe unreachable");
    const account = this.accounts.get(accountReference);
    if (account === undefined) throw new PayoutProviderError("No such account");
    return account;
  }
}
