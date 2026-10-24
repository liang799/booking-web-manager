import { z } from "zod";
import { Money, PayoutAttempt, type UUID } from "@/domain";
import { fromDatabaseCents, toDatabaseCents } from "@/lib/money/cents";
import { LedgerError } from "@/lib/money/errors";
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
import type { PayoutSubmission } from "@/use-cases/payouts/WithdrawSessionPayout";

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
  readonly #requestKeys = new Map<UUID, string>();

  /** Uses the caller's SQL executor so reads and writes share its transaction. */
  constructor(private readonly sql: SqlExecutor, private readonly submission?: PayoutSubmission) {}

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
      const requestKey = text(row.idempotency_key);
      if (requestKey.trim() === "") throw new Error("Stored request key is blank");
      const attempt = new PayoutAttempt({
        payoutId: text(row.payout_id),
        sessionId: text(row.session_id),
        payoutAccountId: text(row.payout_account_id),
        amount: fromDatabaseCents(row.amount_cents, "amount_cents"),
        status: choice(row.status, ["REQUESTED", "COMPLETED", "FAILED"]),
        requestedAt: date(row.requested_at),
        completedAt: optionalDate(row.completed_at),
        failedAt: optionalDate(row.failed_at),
        failureReason: optionalText(row.failure_reason),
        providerReference: optionalText(row.provider_reference),
        destination: hydrateDestination(row.destination),
        lines: storedLines.parse(row.lines).map((line) => ({
          holdId: line.holdId,
          participationId: line.participationId,
          holdingAccountId: line.holdingAccountId,
          walletId: line.walletId,
          kind: line.kind,
          amount: Money.fromCents(line.amountCents),
        })),
      });
      this.#requestKeys.set(attempt.payoutId, requestKey);
      return attempt;
    } catch (cause) {
      throw new SessionPersistenceError("Stored payout attempt could not be hydrated", { cause });
    }
  }

  /** Inserts a new attempt, or stores the outcome of an existing one. Frozen fields never change. */
  async save(attempt: PayoutAttempt): Promise<void> {
    const originalKey = this.#requestKeys.get(attempt.payoutId);
    const requestKey = originalKey ?? this.submission?.idempotencyKey;
    if (requestKey === undefined || requestKey.trim() === "")
      throw new SessionPersistenceError("New payout attempts require preparation request metadata");
    if (originalKey === undefined &&
        (attempt.sessionId !== this.submission?.sessionId || attempt.destination.userId !== this.submission.bookerId))
      throw new SessionPersistenceError("Payout attempt does not belong to its preparation request");
    try {
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
        requestKey,
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
      this.#requestKeys.set(attempt.payoutId, requestKey);
    } catch (cause) {
      if (isDuplicateRequestKey(cause))
        throw new LedgerError("IDEMPOTENCY_CONFLICT", "This payout request key already belongs to an attempt", { cause });
      throw cause;
    }
  }
}

function hydrateDestination(value: unknown) {
  const destination = storedDestination.parse(value);
  return {
    payoutAccountId: destination.payoutAccountId,
    userId: destination.userId,
    providerAccountReference: destination.providerAccountReference,
    bankAccountReference: destination.bankAccountReference,
  };
}

function isDuplicateRequestKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505" &&
    "constraint" in error && error.constraint === "payout_attempts_session_key_unique";
}
