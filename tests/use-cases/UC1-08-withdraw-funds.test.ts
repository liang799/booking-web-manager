import { describe, expect, test } from "vitest";
import {
  PayoutAttempt,
  Session,
  type FinancialInstruction,
  type User,
} from "@/domain";
import { PayoutProviderError } from "@/use-cases/payouts/SetUpPayoutAccount";
import {
  PayoutDeclinedError,
  WithdrawSessionPayout,
  type PayoutDebitInstruction,
  type PayoutTransaction,
  type PayoutTransfers,
  type PayoutUnitOfWork,
  type WithdrawalMethod,
} from "@/use-cases/payouts/WithdrawSessionPayout";
import { createTestUser, readyBookerUser } from "../domain/accounts/user-fixtures";
import {
  committedParticipation,
  hoursAfterSessionEnd,
  sessionDetails,
  verifiedParticipation,
} from "../domain/sessions/session/session-fixtures";

// Owner: Rishi (rbrishi15) — /app/payouts
describe("UC1-08 Withdraw Funds", () => {
  test("pays a verified session's released and forfeited shares to the booker's account", async () => {
    // Arrange
    const { withdraw, store, stripe } = scenario();

    // Act
    const result = await withdraw.forBooker(request());

    // Assert
    expect(result).toEqual({ kind: "PAID", payoutId: "payout-1", amountCents: 1000, bankPayout: "STANDARD" });
    expect(stripe.transferRequests).toEqual([
      { payoutId: "payout-1", sessionId: "s", amountCents: 1000, accountReference: "provider" },
    ]);
    expect(store.session("s").status).toBe("SETTLED");
    expect(store.attempt("payout-1").status).toBe("COMPLETED");
    expect(store.attempt("payout-1").providerReference).toBe("tr_1");
    expect(store.ledger.map(({ kind, participationId, amount, payoutId }) => [kind, participationId, amount.toCents(), payoutId]))
      .toEqual([
        ["RELEASE", "p-alice", 500, "payout-1"],
        ["FORFEIT", "p-ben", 500, "payout-1"],
      ]);
    expect(store.payoutsRecorded.map(({ payoutId, amount, externalReference }) => [payoutId, amount.toCents(), externalReference]))
      .toEqual([["payout-1", 1000, "tr_1"]]);
  });

  test("pays instantly when asked and the debit card is eligible", async () => {
    // Arrange
    const { withdraw, stripe } = scenario({ instantEligible: true });

    // Act
    const result = await withdraw.forBooker(request({ method: "INSTANT" }));

    // Assert
    expect(result).toMatchObject({ kind: "PAID", bankPayout: "INSTANT" });
    expect(stripe.instantPayouts).toEqual(["payout-1"]);
  });

  test("falls back to the standard schedule when the destination is not eligible for instant payouts", async () => {
    // Arrange
    const { withdraw, stripe } = scenario({ instantEligible: false });

    // Act
    const result = await withdraw.forBooker(request({ method: "INSTANT" }));

    // Assert
    expect(result).toMatchObject({ kind: "PAID", bankPayout: "STANDARD" });
    expect(stripe.instantPayouts).toHaveLength(0);
  });

  test("falls back to the standard schedule when Stripe refuses the instant payout", async () => {
    // Arrange
    const { withdraw, store, stripe } = scenario({ instantEligible: true });
    stripe.instantFailure = new PayoutDeclinedError("instant_payouts_limit_exceeded");

    // Act
    const result = await withdraw.forBooker(request({ method: "INSTANT" }));

    // Assert
    expect(result).toMatchObject({ kind: "PAID", bankPayout: "STANDARD" });
    expect(store.session("s").status).toBe("SETTLED");
  });

  test("reopens the session when Stripe declines the transfer, moving no money", async () => {
    // Arrange
    const { withdraw, store, stripe } = scenario();
    stripe.nextTransferFailure = new PayoutDeclinedError("balance_insufficient");

    // Act
    const result = await withdraw.forBooker(request());

    // Assert
    expect(result).toEqual({ kind: "DECLINED", payoutId: "payout-1", reason: "balance_insufficient" });
    expect(store.attempt("payout-1").status).toBe("FAILED");
    expect(store.attempt("payout-1").failureReason).toBe("balance_insufficient");
    expect(store.session("s").status).toBe("AWAITING_PAYOUT");
    expect(store.ledger).toHaveLength(0);
    expect(store.payoutsRecorded).toHaveLength(0);
  });

  test("pays with a new attempt after a declined one", async () => {
    // Arrange
    const { withdraw, store, stripe } = scenario();
    stripe.nextTransferFailure = new PayoutDeclinedError("balance_insufficient");
    await withdraw.forBooker(request({ idempotencyKey: "first" }));

    // Act
    const result = await withdraw.forBooker(request({ idempotencyKey: "second" }));

    // Assert
    expect(result).toMatchObject({ kind: "PAID", payoutId: "payout-2" });
    expect(store.attempt("payout-1").status).toBe("FAILED");
    expect(store.attempt("payout-2").status).toBe("COMPLETED");
    expect(store.payoutsRecorded).toHaveLength(1);
  });

  test("keeps an unclear failure pending, and the retry resumes it without paying twice", async () => {
    // Arrange: Stripe made the transfer, but the response was lost.
    const { withdraw, store, stripe } = scenario();
    stripe.loseNextTransferResponse = true;
    await expect(withdraw.forBooker(request())).rejects.toBeInstanceOf(PayoutProviderError);
    expect(store.attempt("payout-1").status).toBe("REQUESTED");
    expect(store.session("s").status).toBe("PAYOUT_PENDING");

    // Act
    const result = await withdraw.forBooker(request());

    // Assert
    expect(result).toMatchObject({ kind: "PAID", payoutId: "payout-1", amountCents: 1000 });
    expect(stripe.transfersCreated).toBe(1);
    expect(store.payoutsRecorded).toHaveLength(1);
  });

  test("resumes a pending attempt even when the retry uses a new key", async () => {
    // Arrange
    const { withdraw, stripe, store } = scenario();
    stripe.loseNextTransferResponse = true;
    await expect(withdraw.forBooker(request({ idempotencyKey: "first" }))).rejects.toBeInstanceOf(PayoutProviderError);

    // Act
    const result = await withdraw.forBooker(request({ idempotencyKey: "second" }));

    // Assert
    expect(result).toMatchObject({ kind: "PAID", payoutId: "payout-1" });
    expect(stripe.transfersCreated).toBe(1);
    expect(store.attempts()).toHaveLength(1);
  });

  test("a repeated request after success changes nothing", async () => {
    // Arrange
    const { withdraw, store, stripe } = scenario();
    await withdraw.forBooker(request());

    // Act
    const retry = await withdraw.forBooker(request());

    // Assert
    expect(retry).toMatchObject({ kind: "PAID", payoutId: "payout-1" });
    expect(stripe.transfersCreated).toBe(1);
    expect(store.ledger).toHaveLength(2);
    expect(store.payoutsRecorded).toHaveLength(1);
  });

  test("rejects a withdrawal by someone other than the booker", async () => {
    // Arrange
    const { withdraw, stripe } = scenario({ users: [readyBookerUser("booker"), readyBookerUser("mallory")] });

    // Act & Assert
    await expect(withdraw.forBooker(request({ bookerId: "mallory" }))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(stripe.transferRequests).toHaveLength(0);
  });

  test("rejects a booker whose payout account is not set up", async () => {
    // Arrange
    const { withdraw, stripe } = scenario({ users: [createTestUser({ userId: "booker" })] });

    // Act & Assert
    await expect(withdraw.forBooker(request())).rejects.toMatchObject({ code: "PAYOUT_ACCOUNT_NOT_READY" });
    expect(stripe.transferRequests).toHaveLength(0);
  });

  test("rejects a session whose attendance is not yet verified", async () => {
    // Arrange
    const unverified = new Session(
      sessionDetails({
        status: "OPEN",
        participations: [committedParticipation({ holdingAccountId: "platform", bookingShare: verifiedParticipation("x", "ATTENDED").hold!.amount }, "alice")],
      }),
    );
    const { withdraw, stripe } = scenario({ session: unverified });

    // Act & Assert
    await expect(withdraw.forBooker(request())).rejects.toMatchObject({ code: "ATTENDANCE_INCOMPLETE" });
    expect(stripe.transferRequests).toHaveLength(0);
  });
});

function request(
  overrides: Partial<{ bookerId: string; idempotencyKey: string; method: WithdrawalMethod }> = {},
) {
  return {
    bookerId: overrides.bookerId ?? "booker",
    sessionId: "s",
    idempotencyKey: overrides.idempotencyKey ?? "withdraw-1",
    method: overrides.method ?? ("STANDARD" as const),
  };
}

function awaitingPayoutSession(): Session {
  return new Session(
    sessionDetails({
      status: "AWAITING_PAYOUT",
      participations: [verifiedParticipation("alice", "ATTENDED"), verifiedParticipation("ben", "ABSENT")],
    }),
  );
}

function scenario(
  options: { users?: User[]; session?: Session; instantEligible?: boolean } = {},
) {
  const store = new InMemoryPayoutUnitOfWork(
    options.users ?? [readyBookerUser("booker")],
    options.session ?? awaitingPayoutSession(),
  );
  const stripe = new FakeStripeTransfers();
  let id = 0;
  const withdraw = new WithdrawSessionPayout({
    unitOfWork: store,
    transfers: stripe,
    accounts: {
      getAccount: async (accountReference) => ({
        accountReference,
        payoutsEnabled: true,
        defaultDestinationReference: "bank",
        rejected: false,
        instantPayoutsAvailable: options.instantEligible ?? false,
      }),
    },
    clock: { now: () => hoursAfterSessionEnd(1) },
    ids: { next: () => `payout-${(id += 1)}` },
  });
  return { withdraw, store, stripe };
}

/**
 * Real aggregates in memory. Results are stored per key as JSON, as the
 * Postgres idempotency store does, so a replay returns plain data.
 */
class InMemoryPayoutUnitOfWork implements PayoutUnitOfWork {
  readonly #users = new Map<string, User>();
  readonly #sessions = new Map<string, Session>();
  readonly #attempts = new Map<string, PayoutAttempt>();
  readonly #results = new Map<string, string>();
  readonly ledger: FinancialInstruction[] = [];
  readonly payoutsRecorded: PayoutDebitInstruction[] = [];

  constructor(users: readonly User[], session: Session) {
    for (const user of users) this.#users.set(user.userId, user);
    this.#sessions.set(session.sessionId, session);
  }

  session(id: string): Session {
    return this.#sessions.get(id)!;
  }

  attempt(id: string): PayoutAttempt {
    const attempt = this.#attempts.get(id);
    if (attempt === undefined) throw new Error(`No attempt ${id}`);
    return attempt;
  }

  attempts(): PayoutAttempt[] {
    return [...this.#attempts.values()];
  }

  async execute<T>(key: string, work: (transaction: PayoutTransaction) => Promise<T>): Promise<T> {
    const stored = this.#results.get(key);
    if (stored !== undefined) return JSON.parse(stored) as T;
    const result = await work({
      users: { get: async (id) => this.#users.get(id) ?? null },
      sessions: {
        get: async (id) => this.#sessions.get(id) ?? null,
        save: async (session) => void this.#sessions.set(session.sessionId, session),
      },
      payouts: {
        get: async (id) => this.#attempts.get(id) ?? null,
        save: async (attempt) => void this.#attempts.set(attempt.payoutId, attempt),
      },
      ledger: {
        append: async (instructions) => void this.ledger.push(...instructions),
        recordPayout: async (debit) => void this.payoutsRecorded.push(debit),
      },
    });
    this.#results.set(key, JSON.stringify(result ?? null));
    return result;
  }
}

class FakeStripeTransfers implements PayoutTransfers {
  readonly transferRequests: object[] = [];
  readonly #transfers = new Map<string, string>();
  readonly instantPayouts: string[] = [];
  nextTransferFailure?: Error;
  loseNextTransferResponse = false;
  instantFailure?: Error;

  get transfersCreated(): number {
    return this.#transfers.size;
  }

  async transfer(request: { payoutId: string; sessionId: string; amountCents: number; accountReference: string }) {
    this.transferRequests.push({ ...request });
    if (this.nextTransferFailure) {
      const failure = this.nextTransferFailure;
      this.nextTransferFailure = undefined;
      throw failure;
    }
    const existing = this.#transfers.get(request.payoutId);
    if (existing !== undefined) return existing;
    const reference = `tr_${this.#transfers.size + 1}`;
    this.#transfers.set(request.payoutId, reference);
    if (this.loseNextTransferResponse) {
      this.loseNextTransferResponse = false;
      throw new PayoutProviderError("Connection reset after the transfer was created");
    }
    return reference;
  }

  async instantPayout(request: { payoutId: string }) {
    if (this.instantFailure) throw this.instantFailure;
    this.instantPayouts.push(request.payoutId);
  }
}
