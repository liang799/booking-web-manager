import type { Pool } from "pg";
import { PostgresTransactor } from "@/lib/database/postgres-transactor";
import { isRetryable, LedgerError } from "@/lib/money/errors";
import { fingerprintOf, PostgresIdempotencyStore } from "@/lib/money/idempotency";
import { PostgresLedgerWriter } from "@/lib/money/ledger-write-adapter";
import type { SqlExecutor } from "@/lib/money/sql";
import { PostgresUserReader } from "@/lib/sessions/postgres-user-reader";
import type { Clock } from "@/use-cases/shared/contracts";
import type { PayoutSubmission, PayoutTransaction, PayoutUnitOfWork } from "@/use-cases/payouts/WithdrawSessionPayout";
import { PostgresPayoutAttemptRepository } from "./postgres-payout-attempt-repository";
import { PostgresPayoutReceipts } from "./postgres-payout-receipts";
import { PostgresPayoutSessionRepository } from "./postgres-payout-session-repository";

const MAX_ATTEMPTS = 3;

/**
 * Preparation atomically claims/replays the client request. Later transaction
 * callbacks always run against fresh state; their step key names ledger
 * entries only. Session and attempt locks protect lifecycle transitions, and
 * terminal receipts persist the canonical response independently of requests.
 */
export class PostgresPayoutUnitOfWork implements PayoutUnitOfWork {
  constructor(
    private readonly getPool: () => Pool,
    private readonly clock: Clock,
  ) {}

  prepare<T>(submission: PayoutSubmission, work: (transaction: PayoutTransaction) => Promise<T>): Promise<T> {
    // Snapshot caller-owned data before any await, including metadata supplied
    // privately to repositories when a new payable preparation is saved.
    const request = { bookerId: submission.bookerId, sessionId: submission.sessionId, idempotencyKey: submission.idempotencyKey };
    if (request.idempotencyKey.trim() === "")
      throw new LedgerError("INVALID_INSTRUCTION", "idempotencyKey is required");
    const key = JSON.stringify(["UC1-08:prepare", request.bookerId, request.sessionId, request.idempotencyKey]);
    return this.#run(async (sql) => {
      const keys = new PostgresIdempotencyStore(sql);
      const claim = await keys.claim({ idempotencyKey: key, scope: "UC1-08:prepare", fingerprint: fingerprintOf(key) });
      // Namespace, fingerprint and envelope retain legacy preparation replay.
      if (claim.status === "REPLAY") return claim.value as T;
      const result = await work(this.#transaction(sql, key, request));
      await keys.succeed(key, result ?? null);
      return result;
    });
  }

  transaction<T>(stepKey: string, work: (transaction: PayoutTransaction) => Promise<T>): Promise<T> {
    return this.#run((sql) => work(this.#transaction(sql, stepKey)));
  }

  #transaction(sql: SqlExecutor, stepKey: string, submission?: PayoutSubmission): PayoutTransaction {
    const users = new PostgresUserReader(sql, this.clock);
    return {
      users: { get: (id) => users.get(id) },
      sessions: new PostgresPayoutSessionRepository(sql, submission),
      payouts: new PostgresPayoutAttemptRepository(sql, submission),
      ledger: new PostgresLedgerWriter(sql, stepKey),
      receipts: new PostgresPayoutReceipts(sql),
    };
  }

  async #run<T>(work: (sql: SqlExecutor) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await new PostgresTransactor(this.getPool(), "read committed").transaction(work);
      } catch (error) {
        if (isRetryable(error) && attempt < MAX_ATTEMPTS) continue;
        throw error;
      }
    }
  }
}
