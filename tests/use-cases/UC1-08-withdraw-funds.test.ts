import { describe, expect, test, vi } from "vitest";
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
  type PayoutSubmission,
  type TerminalWithdrawalResult,
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

  test("a paid same-key retry makes no provider calls or additional ledger entries", async () => {
    const { withdraw, store, stripe } = scenario({ instantEligible: true });
    const first = await withdraw.forBooker(request({ method: "INSTANT" }));
    const transfers = stripe.transferRequests.length;
    const bankPayouts = stripe.instantPayouts.length;

    const retry = await withdraw.forBooker(request({ method: "INSTANT" }));

    expect(retry).toEqual(first);
    expect(stripe.transferRequests).toHaveLength(transfers);
    expect(stripe.instantPayouts).toHaveLength(bankPayouts);
    expect(store.ledger).toHaveLength(2);
    expect(store.payoutsRecorded).toHaveLength(1);
  });

  test("a declined same-key retry makes no provider calls or financial changes", async () => {
    const { withdraw, store, stripe } = scenario();
    stripe.nextTransferFailure = new PayoutDeclinedError("balance_insufficient");
    const first = await withdraw.forBooker(request());
    const transfers = stripe.transferRequests.length;

    const retry = await withdraw.forBooker(request());

    expect(retry).toEqual(first);
    expect(stripe.transferRequests).toHaveLength(transfers);
    expect(stripe.instantPayouts).toHaveLength(0);
    expect(store.ledger).toHaveLength(0);
    expect(store.payoutsRecorded).toHaveLength(0);
  });

  test.each(["PAID", "DECLINED"] as const)("reconstructing dependencies replays a persisted %s receipt", async (kind) => {
    const { withdraw, reconstruct, store, stripe, accountRequests } = scenario({ instantEligible: true });
    if (kind === "DECLINED") stripe.nextTransferFailure = new PayoutDeclinedError("balance_insufficient");
    const first = await withdraw.forBooker(request({ method: "INSTANT" }));
    const calls = [stripe.transferRequests.length, stripe.instantPayouts.length, accountRequests.length];

    const retry = await reconstruct().forBooker(request({ method: "INSTANT" }));

    expect(retry).toEqual(first);
    expect([stripe.transferRequests.length, stripe.instantPayouts.length, accountRequests.length]).toEqual(calls);
    expect(store.database.receipts.size).toBe(1);
    expect(store.payoutsRecorded).toHaveLength(kind === "PAID" ? 1 : 0);
  });

  test.each(["PAID", "DECLINED"] as const)("recovers legacy %s attempts without dispatching payment", async (kind) => {
    const { withdraw, reconstruct, store, stripe, accountRequests } = scenario({ instantEligible: true });
    if (kind === "DECLINED") stripe.nextTransferFailure = new PayoutDeclinedError("balance_insufficient");
    await withdraw.forBooker(request({ method: "INSTANT" }));
    store.database.receipts.clear();
    const calls = [stripe.transferRequests.length, stripe.instantPayouts.length, accountRequests.length];

    const result = await reconstruct().forBooker(request({ method: "INSTANT" }));

    expect(result).toEqual(kind === "PAID"
      ? { kind: "PAID", payoutId: "payout-1", amountCents: 1000 }
      : { kind: "DECLINED", payoutId: "payout-1", reason: "balance_insufficient" });
    expect([stripe.transferRequests.length, stripe.instantPayouts.length, accountRequests.length]).toEqual(calls);
    expect(store.database.receipts.size).toBe(1);
  });

  test.each(["same", "different"])("concurrent requests with %s keys share one attempt, settlement and receipt", async (keys) => {
    const { withdraw, reconstruct, store, stripe } = scenario({ instantEligible: true });
    const arrived = gate();
    const release = gate();
    const transfer = stripe.transfer.bind(stripe);
    vi.spyOn(stripe, "transfer").mockImplementation(async (input) => {
      const result = await transfer(input);
      if (stripe.transferRequests.length === 2) arrived.release();
      await release.promise;
      return result;
    });

    const first = withdraw.forBooker(request({ method: "INSTANT" }));
    const secondRequest = request({ idempotencyKey: keys === "same" ? "withdraw-1" : "another-key", method: "INSTANT" });
    const second = reconstruct().forBooker(secondRequest);
    await arrived.promise;
    expect(store.attempts()).toHaveLength(1);
    release.release();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual(secondResult);
    expect(stripe.transfersCreated).toBe(1);
    expect(stripe.instantPayouts).toHaveLength(1);
    expect(store.ledger).toHaveLength(2);
    expect(store.payoutsRecorded).toHaveLength(1);
    expect(store.database.receipts.size).toBe(1);
    const previousCalls = stripe.transferRequests.length;
    expect(await reconstruct().forBooker(secondRequest)).toEqual(firstResult);
    expect(stripe.transferRequests).toHaveLength(previousCalls);
  });

  test("a recovery receipt wins while the completion winner is paused before its bank step", async () => {
    const { withdraw, reconstruct, store, stripe } = scenario({ instantEligible: true });
    const completed = gate();
    const resume = gate();
    store.afterTransaction = async (key) => {
      if (key === '["UC1-08:complete","payout-1"]') {
        completed.release();
        await resume.promise;
      }
    };
    const first = withdraw.forBooker(request({ method: "INSTANT" }));
    await completed.promise;
    expect(store.attempt("payout-1").status).toBe("COMPLETED");
    expect(stripe.instantPayouts).toHaveLength(0);

    const recovery = await reconstruct().forBooker(request({ method: "INSTANT" }));
    expect(recovery).toEqual({ kind: "PAID", payoutId: "payout-1", amountCents: 1000 });
    const recorded = store.database.receipts.get("payout-1");
    resume.release();
    const winner = await first;

    expect(winner).toEqual(recovery);
    expect(stripe.transferRequests).toHaveLength(1);
    expect(stripe.instantPayouts).toHaveLength(1);
    expect(store.database.receipts.size).toBe(1);
    expect(store.database.receipts.get("payout-1")).toBe(recorded);
    expect(store.payoutsRecorded).toHaveLength(1);
  });

  test("does not replay bank-step authorization after an interruption", async () => {
    const { withdraw, reconstruct, store, stripe, accountRequests } = scenario({ instantEligible: true });
    stripe.instantFailure = new Error("Interrupted during bank payout");
    await expect(withdraw.forBooker(request({ method: "INSTANT" }))).rejects.toThrow("Interrupted during bank payout");
    expect(store.attempt("payout-1").status).toBe("COMPLETED");
    expect(store.database.receipts.size).toBe(0);

    const recovered = await reconstruct().forBooker(request({ method: "INSTANT" }));

    expect(recovered).toEqual({ kind: "PAID", payoutId: "payout-1", amountCents: 1000 });
    expect(stripe.transferRequests).toHaveLength(1);
    expect(accountRequests).toHaveLength(1);
    expect(stripe.instantPayouts).toHaveLength(1);
    expect(store.payoutsRecorded).toHaveLength(1);
  });

  test.each([
    { first: "tr_1", second: "tr_other", code: "PAYOUT_CONFLICT" },
    { first: "tr_1", second: new PayoutDeclinedError("refused"), code: "STALE_PAYOUT" },
    { first: new PayoutDeclinedError("refused"), second: "tr_1", code: "STALE_PAYOUT" },
    { first: new PayoutDeclinedError("refused"), second: new PayoutDeclinedError("different"), code: "PAYOUT_CONFLICT" },
  ])("preserves $code for conflicting concurrent provider outcomes", async ({ first: firstOutcome, second: secondOutcome, code }) => {
    const { withdraw, reconstruct, store, stripe } = scenario();
    const arrived = gate();
    const firstResponse = gate();
    const secondResponse = gate();
    let calls = 0;
    vi.spyOn(stripe, "transfer").mockImplementation(async () => {
      const index = calls++;
      if (calls === 2) arrived.release();
      await (index === 0 ? firstResponse.promise : secondResponse.promise);
      const outcome = index === 0 ? firstOutcome : secondOutcome;
      if (outcome instanceof Error) throw outcome;
      return outcome;
    });
    const first = withdraw.forBooker(request());
    const second = reconstruct().forBooker(request()).catch((error: unknown) => error);
    await arrived.promise;
    firstResponse.release();
    await first;
    const receipt = store.database.receipts.get("payout-1");
    const ledgerLength = store.ledger.length;
    secondResponse.release();

    expect(await second).toMatchObject({ code });
    expect(store.database.receipts.get("payout-1")).toBe(receipt);
    expect(store.ledger).toHaveLength(ledgerLength);
  });

  test("checks fresh ownership after preparation replay before loading or paying the attempt", async () => {
    const { withdraw, reconstruct, store, stripe } = scenario();
    stripe.loseNextTransferResponse = true;
    await expect(withdraw.forBooker(request())).rejects.toBeInstanceOf(PayoutProviderError);
    const preparation = store.database.preparations.get('["UC1-08:prepare","booker","s","withdraw-1"]')!;
    store.database.preparations.set('["UC1-08:prepare","mallory","s","withdraw-1"]', preparation);

    await expect(reconstruct().forBooker(request({ bookerId: "mallory" }))).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(stripe.transferRequests).toHaveLength(1);
    expect(store.payoutsRecorded).toHaveLength(0);
  });

  test("rolls back a failed preparation with no request claim, attempt or financial effects", async () => {
    const { withdraw, store, stripe } = scenario();
    store.failNextCommit = true;

    await expect(withdraw.forBooker(request())).rejects.toThrow("Commit failed");

    expect(store.session("s").status).toBe("AWAITING_PAYOUT");
    expect(store.session("s").pendingSettlement).toBeUndefined();
    expect(store.session("s").payoutAttemptIds).toHaveLength(0);
    expect(store.database.preparations.size).toBe(0);
    expect(store.attempts()).toHaveLength(0);
    expect(store.ledger).toHaveLength(0);
    expect(stripe.transferRequests).toHaveLength(0);
    expect(await withdraw.forBooker(request())).toMatchObject({ kind: "PAID", payoutId: "payout-2" });
  });

  test("rolls back failure and its receipt together", async () => {
    const { withdraw, store, stripe } = scenario();
    vi.spyOn(stripe, "transfer").mockImplementationOnce(async () => {
      store.failNextCommit = true;
      throw new PayoutDeclinedError("balance_insufficient");
    });

    await expect(withdraw.forBooker(request())).rejects.toThrow("Commit failed");

    expect(store.session("s").status).toBe("PAYOUT_PENDING");
    expect(store.attempt("payout-1").status).toBe("REQUESTED");
    expect(store.database.receipts.size).toBe(0);
    expect(store.ledger).toHaveLength(0);
    expect(await withdraw.forBooker(request())).toMatchObject({ kind: "PAID", payoutId: "payout-1" });
  });

  test("rolls back settlement and ledger together, then resumes the pending attempt", async () => {
    const { withdraw, store, stripe } = scenario();
    const transfer = stripe.transfer.bind(stripe);
    vi.spyOn(stripe, "transfer").mockImplementationOnce(async (input) => {
      const reference = await transfer(input);
      store.failNextCommit = true;
      return reference;
    });

    await expect(withdraw.forBooker(request())).rejects.toThrow("Commit failed");

    expect(store.session("s").status).toBe("PAYOUT_PENDING");
    expect(store.attempt("payout-1").status).toBe("REQUESTED");
    expect(store.ledger).toHaveLength(0);
    expect(store.payoutsRecorded).toHaveLength(0);
    expect(store.database.receipts.size).toBe(0);
    expect(await withdraw.forBooker(request())).toMatchObject({ kind: "PAID", payoutId: "payout-1" });
    expect(store.ledger).toHaveLength(2);
    expect(store.payoutsRecorded).toHaveLength(1);
    expect(stripe.transfersCreated).toBe(1);
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
  const accountRequests: string[] = [];
  const create = (unitOfWork: PayoutUnitOfWork) => new WithdrawSessionPayout({
    unitOfWork,
    transfers: stripe,
    accounts: {
      getAccount: async (accountReference) => {
        accountRequests.push(accountReference);
        return {
        accountReference,
        payoutsEnabled: true,
        defaultDestinationReference: "bank",
        rejected: false,
        instantPayoutsAvailable: options.instantEligible ?? false,
        };
      },
    },
    clock: { now: () => hoursAfterSessionEnd(1) },
    ids: { next: () => `payout-${(id += 1)}` },
  });
  return { withdraw: create(store), store, stripe, accountRequests, reconstruct: () => create(store.reconnect()) };
}

/** Shared persisted state; reconnecting recreates dependencies without losing committed data. */
class PayoutDatabase {
  users = new Map<string, User>();
  sessions = new Map<string, Session>();
  attempts = new Map<string, PayoutAttempt>();
  preparations = new Map<string, string>();
  receipts = new Map<string, string>();
  ledger: FinancialInstruction[] = [];
  payoutsRecorded: PayoutDebitInstruction[] = [];
  queue: Promise<unknown> = Promise.resolve();
}

/** Serial transactions use detached roots and publish changes only after successful work. */
class InMemoryPayoutUnitOfWork implements PayoutUnitOfWork {
  readonly database: PayoutDatabase;
  afterTransaction?: (key: string) => Promise<void>;
  failNextCommit = false;

  constructor(users: readonly User[], session: Session, database = new PayoutDatabase()) {
    this.database = database;
    for (const user of users) database.users.set(user.userId, user);
    if (!database.sessions.has(session.sessionId)) database.sessions.set(session.sessionId, session);
  }

  reconnect(): InMemoryPayoutUnitOfWork {
    return new InMemoryPayoutUnitOfWork([], this.session("s"), this.database);
  }

  get ledger() { return this.database.ledger; }
  get payoutsRecorded() { return this.database.payoutsRecorded; }
  session(id: string): Session { return this.database.sessions.get(id)!; }
  attempt(id: string): PayoutAttempt { return this.database.attempts.get(id)!; }
  attempts(): PayoutAttempt[] { return [...this.database.attempts.values()]; }

  prepare<T>(submission: PayoutSubmission, work: (transaction: PayoutTransaction) => Promise<T>): Promise<T> {
    const key = JSON.stringify(["UC1-08:prepare", submission.bookerId, submission.sessionId, submission.idempotencyKey]);
    return this.#run(key, work, true);
  }

  transaction<T>(key: string, work: (transaction: PayoutTransaction) => Promise<T>): Promise<T> {
    return this.#run(key, work, false);
  }

  async #run<T>(key: string, work: (transaction: PayoutTransaction) => Promise<T>, replay: boolean): Promise<T> {
    const run = this.database.queue.then(async () => {
      const stored = replay ? this.database.preparations.get(key) : undefined;
      if (stored !== undefined) return JSON.parse(stored) as T;
      const sessions = new Map([...this.database.sessions].map(([id, session]) => [id, cloneSession(session)]));
      const attempts = new Map([...this.database.attempts].map(([id, attempt]) => [id, cloneAttempt(attempt)]));
      const receipts = new Map(this.database.receipts);
      const ledger: FinancialInstruction[] = [];
      const payouts: PayoutDebitInstruction[] = [];
      const result = await work({
        users: { get: async (id) => this.database.users.get(id) ?? null },
        sessions: {
          get: async (id) => sessions.get(id) ?? null,
          save: async (session) => void sessions.set(session.sessionId, session),
        },
        payouts: {
          get: async (id) => attempts.get(id) ?? null,
          save: async (attempt) => void attempts.set(attempt.payoutId, attempt),
        },
        ledger: {
          append: async (instructions) => void ledger.push(...instructions),
          recordPayout: async (debit) => void payouts.push(debit),
        },
        receipts: {
          get: async (id) => {
            const stored = receipts.get(id);
            return stored === undefined ? null : JSON.parse(stored) as TerminalWithdrawalResult;
          },
          storeIfAbsent: async (receipt) => {
            const stored = receipts.get(receipt.payoutId);
            if (stored !== undefined) return JSON.parse(stored) as TerminalWithdrawalResult;
            receipts.set(receipt.payoutId, JSON.stringify(receipt));
            return receipt;
          },
        },
      });
      if (this.failNextCommit) {
        this.failNextCommit = false;
        throw new Error("Commit failed");
      }
      this.database.sessions = sessions;
      this.database.attempts = attempts;
      this.database.receipts = receipts;
      this.database.ledger.push(...ledger);
      this.database.payoutsRecorded.push(...payouts);
      if (replay) this.database.preparations.set(key, JSON.stringify(result));
      return result;
    });
    this.database.queue = run.catch(() => undefined);
    const result = await run;
    await this.afterTransaction?.(key);
    return result;
  }
}

function cloneSession(session: Session): Session {
  return new Session({
    sessionId: session.sessionId,
    bookerId: session.bookerId,
    invitedGroupId: session.invitedGroupId,
    booking: session.booking,
    bookingShare: session.bookingShare,
    totalSlots: session.totalSlots,
    visibility: session.visibility,
    status: session.status,
    minimumReliability: session.minimumReliability,
    roomToken: session.roomToken,
    holdingAccountId: session.holdingAccountId,
    participations: session.participantList.participations,
    nextQueueSequence: session.participantList.nextQueueSequence,
    pendingSettlement: session.pendingSettlement,
    payoutAttemptIds: session.payoutAttemptIds,
  });
}

function cloneAttempt(attempt: PayoutAttempt): PayoutAttempt {
  return new PayoutAttempt({
    payoutId: attempt.payoutId,
    sessionId: attempt.sessionId,
    payoutAccountId: attempt.payoutAccountId,
    amount: attempt.amount,
    status: attempt.status,
    requestedAt: attempt.requestedAt,
    completedAt: attempt.completedAt,
    failedAt: attempt.failedAt,
    failureReason: attempt.failureReason,
    providerReference: attempt.providerReference,
    destination: attempt.destination,
    lines: attempt.lines,
  });
}

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
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
    this.instantPayouts.push(request.payoutId);
    if (this.instantFailure) throw this.instantFailure;
  }
}
