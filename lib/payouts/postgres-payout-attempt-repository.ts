import { z } from "zod";
import { Money, PayoutAttempt, type UUID } from "@/domain";
import { fromDatabaseCents, toDatabaseCents } from "@/lib/money/cents";
import type { SqlExecutor } from "@/lib/money/sql";
import {
  choice,
  date,
  optionalDate,
  optionalText,
  SessionPersistenceError,
  text,
} from "@/lib/sessions/postgres-row-values";
import type { Repository } from "@/use-cases/shared/contracts";

const storedDestination = z.object({
  payoutAccountId: z.string().min(1),
  userId: z.string().min(1),
  providerAccountReference: z.string().min(1),
  bankAccountReference: z.string().min(1),
});

const storedLines = z
  .array(
    z.object({
      holdId: z.string().min(1),
      participationId: z.string().min(1),
      holdingAccountId: z.string().min(1),
      walletId: z.string().min(1),
      amountCents: z.number().int().safe().positive(),
      kind: z.enum(["RELEASE", "FORFEIT"]),
    }),
  )
  .min(1);

/** Persists the PayoutAttempt aggregate (migration 0012); `get` locks the row. */
export class PostgresPayoutAttemptRepository implements Repository<PayoutAttempt> {
  /** Uses the caller's SQL executor so reads and writes share its transaction. */
  constructor(private readonly sql: SqlExecutor) {}

  async get(payoutId: UUID): Promise<PayoutAttempt | null> {
    const rows = await this.sql.query(
      `select payout_id, session_id, payout_account_id, amount_cents, status, idempotency_key,
              requested_at, completed_at, failed_at, failure_reason, provider_reference, destination, lines
         from payout_attempts where payout_id = $1 for update`,
      [payoutId],
    );
    const row = rows[0];
    if (row === undefined) return null;
    try {
      return new PayoutAttempt({
        payoutId: text(row.payout_id),
        sessionId: text(row.session_id),
        payoutAccountId: text(row.payout_account_id),
        amount: fromDatabaseCents(row.amount_cents, "amount_cents"),
        status: choice(row.status, ["REQUESTED", "COMPLETED", "FAILED"]),
        idempotencyKey: text(row.idempotency_key),
        requestedAt: date(row.requested_at),
        completedAt: optionalDate(row.completed_at),
        failedAt: optionalDate(row.failed_at),
        failureReason: optionalText(row.failure_reason),
        providerReference: optionalText(row.provider_reference),
        destination: storedDestination.parse(row.destination),
        lines: storedLines.parse(row.lines).map(({ amountCents, ...line }) => ({
          ...line,
          amount: Money.fromCents(amountCents),
        })),
      });
    } catch (cause) {
      throw new SessionPersistenceError("Stored payout attempt could not be hydrated", { cause });
    }
  }

  /** Inserts a new attempt, or stores the outcome of an existing one. Frozen fields never change. */
  async save(attempt: PayoutAttempt): Promise<void> {
    await this.sql.query(
      `insert into payout_attempts (payout_id, session_id, payout_account_id, amount_cents, status,
         idempotency_key, requested_at, completed_at, failed_at, failure_reason, provider_reference,
         destination, lines)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb)
       on conflict (payout_id) do update set
         status = excluded.status,
         completed_at = excluded.completed_at,
         failed_at = excluded.failed_at,
         failure_reason = excluded.failure_reason,
         provider_reference = excluded.provider_reference`,
      [
        attempt.payoutId,
        attempt.sessionId,
        attempt.payoutAccountId,
        toDatabaseCents(attempt.amount),
        attempt.status,
        attempt.idempotencyKey,
        attempt.requestedAt,
        attempt.completedAt ?? null,
        attempt.failedAt ?? null,
        attempt.failureReason ?? null,
        attempt.providerReference ?? null,
        JSON.stringify(attempt.destination),
        JSON.stringify(
          attempt.lines.map((line) => ({
            holdId: line.holdId,
            participationId: line.participationId,
            holdingAccountId: line.holdingAccountId,
            walletId: line.walletId,
            amountCents: line.amount.toCents(),
            kind: line.kind,
          })),
        ),
      ],
    );
  }
}
