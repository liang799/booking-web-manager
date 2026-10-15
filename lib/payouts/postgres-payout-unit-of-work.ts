import type { Pool } from "pg";
import { PostgresTransactor } from "@/lib/database/postgres-transactor";
import { isRetryable } from "@/lib/money/errors";
import { fingerprintOf, PostgresIdempotencyStore } from "@/lib/money/idempotency";
import { PostgresLedgerWriter } from "@/lib/money/ledger-write-adapter";
import { PostgresUserReader } from "@/lib/sessions/postgres-user-reader";
import type { Clock } from "@/use-cases/shared/contracts";
import type { PayoutTransaction, PayoutUnitOfWork } from "@/use-cases/payouts/WithdrawSessionPayout";
import { PostgresPayoutAttemptRepository } from "./postgres-payout-attempt-repository";
import { PostgresPayoutSessionRepository } from "./postgres-payout-session-repository";

const MAX_ATTEMPTS = 3;

/**
 * Production unit of work for UC1-08. Each `execute` is one READ COMMITTED
 * transaction that claims the idempotency key (a repeated key returns the
 * stored result, CLAUDE.md rule #6), gives the work the complete User, the
 * locked Session and PayoutAttempt, and a ledger writer on the same
 * connection, then stores the result under the key. Ledger entry keys derive
 * from the unit-of-work key, so a replay cannot append twice. Serialization
 * failures and deadlocks restart the whole transaction. Nothing here calls
 * Stripe (rule #4).
 */
export class PostgresPayoutUnitOfWork implements PayoutUnitOfWork {
  constructor(
    private readonly getPool: () => Pool,
    private readonly clock: Clock,
  ) {}

  async execute<T>(
    idempotencyKey: string,
    work: (transaction: PayoutTransaction) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await new PostgresTransactor(this.getPool(), "read committed").transaction(async (sql) => {
          const keys = new PostgresIdempotencyStore(sql);
          const claim = await keys.claim({
            idempotencyKey,
            scope: scopeOf(idempotencyKey),
            fingerprint: fingerprintOf(idempotencyKey),
          });
          // The key binds the stored value to this operation's result type.
          if (claim.status === "REPLAY") return claim.value as T;

          const users = new PostgresUserReader(sql, this.clock);
          const result = await work({
            users: { get: (id) => users.get(id) },
            sessions: new PostgresPayoutSessionRepository(sql),
            payouts: new PostgresPayoutAttemptRepository(sql),
            ledger: new PostgresLedgerWriter(sql, idempotencyKey),
          });
          await keys.succeed(idempotencyKey, result ?? null);
          return result;
        });
      } catch (error) {
        if (isRetryable(error) && attempt < MAX_ATTEMPTS) continue;
        throw error;
      }
    }
  }
}

/** Payout keys are JSON arrays whose first element names the step, such as `["UC1-08:prepare", …]`. */
function scopeOf(idempotencyKey: string): string {
  try {
    const parsed: unknown = JSON.parse(idempotencyKey);
    if (Array.isArray(parsed) && typeof parsed[0] === "string" && parsed[0] !== "") return parsed[0];
  } catch {
    // Not a structured key; fall through to the shared scope.
  }
  return "UC1-08";
}
