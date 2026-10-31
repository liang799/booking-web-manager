import {
  DomainError,
  PayoutAttempt,
  type FinancialInstruction,
  type Money,
  type PayoutBatch,
  type Session,
  type User,
  type UUID,
} from "@/domain";
import type { Clock, IdGenerator, Repository } from "@/use-cases/shared/contracts";
import { PayoutProviderError, type PayoutAccountProvider } from "./SetUpPayoutAccount";

/** Records that a settled payout left the platform (the ledger's PAYOUT entry). */
export interface PayoutDebitInstruction {
  readonly payoutId: UUID;
  readonly sessionId: UUID;
  readonly amount: Money;
  readonly occurredAt: Date;
  readonly externalReference: string;
}

export interface PayoutLedger {
  append(instructions: readonly FinancialInstruction[]): Promise<void>;
  recordPayout(debit: PayoutDebitInstruction): Promise<void>;
}

/** One transaction over the roots a payout changes (ADR-0003), plus the ledger. */
export interface PayoutTransaction {
  readonly users: Pick<Repository<User>, "get">;
  readonly sessions: Repository<Session>;
  readonly payouts: Repository<PayoutAttempt>;
  readonly ledger: PayoutLedger;
  readonly receipts: {
    get(payoutId: UUID): Promise<TerminalWithdrawalResult | null>;
    /** Never overwrites a receipt; returns the canonical result, including after a race. */
    storeIfAbsent(result: TerminalWithdrawalResult): Promise<TerminalWithdrawalResult>;
  };
}

export interface PayoutSubmission {
  readonly bookerId: UUID;
  readonly sessionId: UUID;
  readonly idempotencyKey: string;
}

export interface PayoutUnitOfWork {
  /** Atomically stores/replays preparation; request metadata stays inside the adapters. */
  prepare<T>(submission: PayoutSubmission, work: (transaction: PayoutTransaction) => Promise<T>): Promise<T>;
  /** Always executes against fresh state; the key only supplies deterministic ledger identity. */
  transaction<T>(stepKey: string, work: (transaction: PayoutTransaction) => Promise<T>): Promise<T>;
}

/**
 * Moves money out to the booker's provider account. Every call happens outside
 * a database transaction (CLAUDE.md rule #4).
 */
export interface PayoutTransfers {
  /**
   * Transfers the payout from the platform to the connected account and
   * returns the provider's reference. An existing transfer for the same payout
   * is reused, so a retry can never pay twice.
   */
  transfer(request: {
    readonly payoutId: UUID;
    readonly sessionId: UUID;
    readonly amountCents: number;
    readonly accountReference: string;
  }): Promise<string>;
  /** Sends the amount from the connected account to its debit card at once. */
  instantPayout(request: {
    readonly payoutId: UUID;
    readonly amountCents: number;
    readonly accountReference: string;
  }): Promise<void>;
}

/** The provider definitively refused, so no money moved and the attempt can fail. */
export class PayoutDeclinedError extends PayoutProviderError {
  constructor(
    readonly reason: string,
    options?: ErrorOptions,
  ) {
    super(`The payout provider declined the payout: ${reason}`, options);
    this.name = "PayoutDeclinedError";
  }
}

export type WithdrawalMethod = "STANDARD" | "INSTANT";

export interface WithdrawSessionPayoutRequest extends PayoutSubmission {
  readonly method: WithdrawalMethod;
}

export type WithdrawalResult =
  | {
      readonly kind: "PAID";
      readonly payoutId: UUID;
      readonly amountCents: number;
      /** INSTANT reached the debit card now; STANDARD follows Stripe's schedule. Omitted on recovery. */
      readonly bankPayout?: WithdrawalMethod;
    }
  /** Every share was refunded, so the session settled with nothing to pay. */
  | { readonly kind: "NOTHING_TO_PAY" }
  /** The provider refused; the session is back to AWAITING_PAYOUT for a new attempt. */
  | { readonly kind: "DECLINED"; readonly payoutId: UUID; readonly reason: string };

export type TerminalWithdrawalResult = Exclude<WithdrawalResult, { readonly kind: "NOTHING_TO_PAY" }>;

type Prepared =
  | {
      readonly kind: "REQUESTED";
      readonly payoutId: UUID;
      readonly sessionId: UUID;
      readonly amountCents: number;
      readonly accountReference: string;
    }
  | { readonly kind: "NOTHING_TO_PAY" };

type Requested = Extract<Prepared, { kind: "REQUESTED" }>;

export interface WithdrawSessionPayoutDependencies {
  readonly unitOfWork: PayoutUnitOfWork;
  readonly transfers: PayoutTransfers;
  readonly accounts: Pick<PayoutAccountProvider, "getAccount">;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/**
 * UC1-08 Withdraw Funds: the booker withdraws a verified session's settlement
 * (released and forfeited shares) to their payout account.
 *
 * 1. Prepare, in one transaction: `Booker.preparePayout` freezes the batch and
 *    `PayoutAttempt.create` records it. The REQUESTED attempt is the durable
 *    intent.
 * 2. Transfer, outside any transaction: platform → booker's connected account.
 * 3. Complete, in one transaction: the attempt completes, the Session settles,
 *    and the ledger appends the RELEASE/FORFEIT lines and the PAYOUT entry.
 *    A definite provider refusal fails the attempt instead and reopens the
 *    session for a new one; an ambiguous failure leaves it REQUESTED, and
 *    retrying the request resumes it.
 * 4. Only the invocation that newly completed the attempt may start the bank
 *    step, then records an immutable receipt. Retries read fresh state and
 *    return terminal receipts without calling either provider operation.
 */
export class WithdrawSessionPayout {
  constructor(private readonly dependencies: WithdrawSessionPayoutDependencies) {}

  async forBooker(request: WithdrawSessionPayoutRequest): Promise<WithdrawalResult> {
    const prepared = await this.#prepare(request);
    if (prepared.kind === "NOTHING_TO_PAY") return prepared;

    const receipt = await this.dependencies.unitOfWork.transaction(
      JSON.stringify(["UC1-08:dispatch", prepared.payoutId]),
      async (transaction) => {
        const { attempt, session } = await loadAttempt(transaction, request.bookerId, prepared);
        if (attempt.status !== "REQUESTED") return terminalReceipt(transaction, attempt);
        DomainError.require(
          session.pendingSettlement?.payoutId === attempt.payoutId,
          "STALE_PAYOUT",
          "The requested payout is no longer pending for this session",
        );
        DomainError.require(
          (await transaction.receipts.get(attempt.payoutId)) === null,
          "PAYOUT_CONFLICT",
          "A requested payout cannot have a terminal receipt",
        );
        return null;
      },
    );
    if (receipt !== null) return receipt;

    let transferReference: string;
    try {
      transferReference = await this.dependencies.transfers.transfer({
        payoutId: prepared.payoutId,
        sessionId: prepared.sessionId,
        amountCents: prepared.amountCents,
        accountReference: prepared.accountReference,
      });
    } catch (error) {
      if (!(error instanceof PayoutDeclinedError)) throw error;
      return this.#fail(request.bookerId, prepared, error.reason);
    }
    const completed = await this.#complete(request.bookerId, prepared, transferReference);
    if (completed !== null) return completed;

    // Only this invocation changed REQUESTED → COMPLETED. This authorization is
    // never persisted or replayed; a recovery caller records a neutral receipt.
    const bankPayout = await this.#bankPayout(request.method, prepared);
    return this.dependencies.unitOfWork.transaction(
      JSON.stringify(["UC1-08:result", prepared.payoutId]),
      async (transaction) => {
        const { attempt } = await loadAttempt(transaction, request.bookerId, prepared);
        return transaction.receipts.storeIfAbsent({
          kind: "PAID",
          payoutId: attempt.payoutId,
          amountCents: attempt.amount.toCents(),
          bankPayout,
        });
      },
    );
  }

  #prepare(request: WithdrawSessionPayoutRequest): Promise<Prepared> {
    const submission: PayoutSubmission = {
      bookerId: request.bookerId,
      sessionId: request.sessionId,
      idempotencyKey: request.idempotencyKey,
    };
    return this.dependencies.unitOfWork.prepare(submission, async (transaction): Promise<Prepared> => {
      const booker = await transaction.users.get(request.bookerId);
      const session = await transaction.sessions.get(request.sessionId);
      if (booker === null || session === null)
        throw new DomainError("NOT_FOUND", "The session was not found");
      authorize(session, request.bookerId);
      // An attempt already in flight is resumed, not duplicated.
      const pending = session.pendingSettlement;
      if (session.status === "PAYOUT_PENDING" && pending !== undefined) return requested(pending);

      const batch = booker.asBooker().preparePayout(session, {
        payoutId: this.dependencies.ids.next(),
        now: this.dependencies.clock.now(),
      });
      await transaction.sessions.save(session);
      if (batch === undefined) return { kind: "NOTHING_TO_PAY" };
      await transaction.payouts.save(PayoutAttempt.create(batch));
      return requested(batch);
    });
  }

  /** Null authorizes only the invocation that newly completed the attempt to run the bank step. */
  #complete(bookerId: UUID, prepared: Requested, transferReference: string): Promise<TerminalWithdrawalResult | null> {
    return this.dependencies.unitOfWork.transaction(
      JSON.stringify(["UC1-08:complete", prepared.payoutId]),
      async (transaction) => {
        const { session, attempt } = await loadAttempt(transaction, bookerId, prepared);
        const now = this.dependencies.clock.now();
        // Check provider consistency even if another invocation has already stored a receipt.
        if (!attempt.complete(transferReference, now)) return terminalReceipt(transaction, attempt);
        const settlement = session.completeSettlement(prepared.payoutId, now);
        await transaction.ledger.append(settlement.instructions);
        await transaction.ledger.recordPayout({
          payoutId: prepared.payoutId,
          sessionId: prepared.sessionId,
          amount: attempt.amount,
          occurredAt: now,
          externalReference: transferReference,
        });
        await transaction.sessions.save(session);
        await transaction.payouts.save(attempt);
        return null;
      },
    );
  }

  #fail(bookerId: UUID, prepared: Requested, reason: string): Promise<TerminalWithdrawalResult> {
    return this.dependencies.unitOfWork.transaction(
      JSON.stringify(["UC1-08:fail", prepared.payoutId]),
      async (transaction) => {
        const { session, attempt } = await loadAttempt(transaction, bookerId, prepared);
        const now = this.dependencies.clock.now();
        if (attempt.fail(reason, now)) {
          session.failSettlement(prepared.payoutId, now);
          await transaction.sessions.save(session);
          await transaction.payouts.save(attempt);
        }
        // The failed state and its immutable receipt commit together.
        return terminalReceipt(transaction, attempt);
      },
    );
  }

  /** Instant only when asked for and the destination is an eligible debit card; otherwise standard. */
  async #bankPayout(
    method: WithdrawalMethod,
    prepared: Requested,
  ): Promise<WithdrawalMethod> {
    if (method !== "INSTANT") return "STANDARD";
    try {
      const account = await this.dependencies.accounts.getAccount(prepared.accountReference);
      if (!account.instantPayoutsAvailable) return "STANDARD";
      await this.dependencies.transfers.instantPayout({
        payoutId: prepared.payoutId,
        amountCents: prepared.amountCents,
        accountReference: prepared.accountReference,
      });
      return "INSTANT";
    } catch (error) {
      // The money is already in the booker's account; the standard schedule still pays it.
      if (error instanceof PayoutProviderError) return "STANDARD";
      throw error;
    }
  }
}

function requested(batch: PayoutBatch): Prepared {
  return {
    kind: "REQUESTED",
    payoutId: batch.payoutId,
    sessionId: batch.sessionId,
    amountCents: batch.lines.reduce((sum, line) => sum + line.amount.toCents(), 0),
    accountReference: batch.destination.providerAccountReference,
  };
}

function authorize(session: Session, bookerId: UUID): void {
  DomainError.require(
    session.bookerId === bookerId,
    "UNAUTHORIZED",
    "Only the booker may withdraw this session's payout",
  );
}

async function loadAttempt(transaction: PayoutTransaction, bookerId: UUID, prepared: Requested) {
  // Every path, including receipt recovery, locks Session before PayoutAttempt.
  const session = await transaction.sessions.get(prepared.sessionId);
  if (session === null) throw new DomainError("NOT_FOUND", "The session was not found");
  authorize(session, bookerId);
  const attempt = await transaction.payouts.get(prepared.payoutId);
  if (attempt === null) throw new DomainError("NOT_FOUND", "The payout attempt was not found");
  DomainError.require(
    attempt.sessionId === session.sessionId &&
      session.payoutAttemptIds.includes(attempt.payoutId) &&
      attempt.destination.userId === bookerId &&
      attempt.amount.toCents() === prepared.amountCents &&
      attempt.destination.providerAccountReference === prepared.accountReference,
    "PAYOUT_CONFLICT",
    "The prepared payout does not match its recorded attempt",
  );
  return { session, attempt };
}

async function terminalReceipt(transaction: PayoutTransaction, attempt: PayoutAttempt): Promise<TerminalWithdrawalResult> {
  const stored = await transaction.receipts.get(attempt.payoutId);
  if (stored !== null) return stored;
  if (attempt.status === "FAILED") {
    return transaction.receipts.storeIfAbsent({
      kind: "DECLINED",
      payoutId: attempt.payoutId,
      reason: attempt.failureReason!,
    });
  }
  DomainError.require(attempt.status === "COMPLETED", "PAYOUT_CONFLICT", "The payout has no terminal outcome");
  // Completion predates the receipt or its winner was interrupted. Never infer
  // the bank method or redispatch payment just to reconstruct a richer result.
  return transaction.receipts.storeIfAbsent({
    kind: "PAID",
    payoutId: attempt.payoutId,
    amountCents: attempt.amount.toCents(),
  });
}
