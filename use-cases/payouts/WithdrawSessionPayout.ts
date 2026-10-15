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
}

/** Runs each key's work once in one transaction; a repeated key returns the stored result. */
export interface PayoutUnitOfWork {
  execute<T>(idempotencyKey: string, work: (transaction: PayoutTransaction) => Promise<T>): Promise<T>;
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

export interface WithdrawSessionPayoutRequest {
  readonly bookerId: UUID;
  readonly sessionId: UUID;
  readonly idempotencyKey: string;
  readonly method: WithdrawalMethod;
}

export type WithdrawalResult =
  | {
      readonly kind: "PAID";
      readonly payoutId: UUID;
      readonly amountCents: number;
      /** INSTANT reached the debit card now; STANDARD follows Stripe's payout schedule. */
      readonly bankPayout: WithdrawalMethod;
    }
  /** Every share was refunded, so the session settled with nothing to pay. */
  | { readonly kind: "NOTHING_TO_PAY" }
  /** The provider refused; the session is back to AWAITING_PAYOUT for a new attempt. */
  | { readonly kind: "DECLINED"; readonly payoutId: UUID; readonly reason: string };

type Prepared =
  | {
      readonly kind: "REQUESTED";
      readonly payoutId: UUID;
      readonly sessionId: UUID;
      readonly amountCents: number;
      readonly accountReference: string;
    }
  | { readonly kind: "NOTHING_TO_PAY" };

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
 * 4. Bank payout, best effort: instant to an eligible debit card when asked
 *    for, otherwise Stripe's standard schedule.
 */
export class WithdrawSessionPayout {
  constructor(private readonly dependencies: WithdrawSessionPayoutDependencies) {}

  async forBooker(request: WithdrawSessionPayoutRequest): Promise<WithdrawalResult> {
    const prepared = await this.#prepare(request);
    if (prepared.kind === "NOTHING_TO_PAY") return prepared;

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
      await this.#fail(prepared, error.reason);
      return { kind: "DECLINED", payoutId: prepared.payoutId, reason: error.reason };
    }
    await this.#complete(prepared, transferReference);
    return {
      kind: "PAID",
      payoutId: prepared.payoutId,
      amountCents: prepared.amountCents,
      bankPayout: await this.#bankPayout(request.method, prepared),
    };
  }

  #prepare(request: WithdrawSessionPayoutRequest): Promise<Prepared> {
    const key = JSON.stringify([
      "UC1-08:prepare",
      request.bookerId,
      request.sessionId,
      request.idempotencyKey,
    ]);
    return this.dependencies.unitOfWork.execute(key, async (transaction): Promise<Prepared> => {
      const booker = await transaction.users.get(request.bookerId);
      const session = await transaction.sessions.get(request.sessionId);
      if (booker === null || session === null)
        throw new DomainError("NOT_FOUND", "The session was not found");
      DomainError.require(
        session.bookerId === request.bookerId,
        "UNAUTHORIZED",
        "Only the booker may withdraw this session's payout",
      );
      // An attempt already in flight is resumed, not duplicated.
      const pending = session.pendingSettlement;
      if (session.status === "PAYOUT_PENDING" && pending !== undefined) return requested(pending);

      const batch = booker.asBooker().preparePayout(session, {
        payoutId: this.dependencies.ids.next(),
        idempotencyKey: request.idempotencyKey,
        now: this.dependencies.clock.now(),
      });
      await transaction.sessions.save(session);
      if (batch === undefined) return { kind: "NOTHING_TO_PAY" };
      await transaction.payouts.save(PayoutAttempt.create(batch));
      return requested(batch);
    });
  }

  async #complete(
    prepared: Extract<Prepared, { kind: "REQUESTED" }>,
    transferReference: string,
  ): Promise<void> {
    await this.dependencies.unitOfWork.execute(
      JSON.stringify(["UC1-08:complete", prepared.payoutId]),
      async (transaction) => {
        // Lock order matches preparation: the session first, then the attempt.
        const session = await transaction.sessions.get(prepared.sessionId);
        const attempt = await transaction.payouts.get(prepared.payoutId);
        if (session === null || attempt === null)
          throw new DomainError("NOT_FOUND", "The payout attempt was not found");
        const now = this.dependencies.clock.now();
        if (!attempt.complete(transferReference, now)) return;
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
      },
    );
  }

  async #fail(prepared: Extract<Prepared, { kind: "REQUESTED" }>, reason: string): Promise<void> {
    await this.dependencies.unitOfWork.execute(
      JSON.stringify(["UC1-08:fail", prepared.payoutId]),
      async (transaction) => {
        const session = await transaction.sessions.get(prepared.sessionId);
        const attempt = await transaction.payouts.get(prepared.payoutId);
        if (session === null || attempt === null)
          throw new DomainError("NOT_FOUND", "The payout attempt was not found");
        const now = this.dependencies.clock.now();
        if (!attempt.fail(reason, now)) return;
        session.failSettlement(prepared.payoutId, now);
        await transaction.sessions.save(session);
        await transaction.payouts.save(attempt);
      },
    );
  }

  /** Instant only when asked for and the destination is an eligible debit card; otherwise standard. */
  async #bankPayout(
    method: WithdrawalMethod,
    prepared: Extract<Prepared, { kind: "REQUESTED" }>,
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
