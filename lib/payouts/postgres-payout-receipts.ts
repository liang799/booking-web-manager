import { z } from "zod";
import type { UUID } from "@/domain";
import { fingerprintOf } from "@/lib/money/idempotency";
import type { SqlExecutor, SqlRow } from "@/lib/money/sql";
import { SessionPersistenceError } from "@/lib/sessions/postgres-row-values";
import type { TerminalWithdrawalResult } from "@/use-cases/payouts/WithdrawSessionPayout";

const receipt = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("PAID"),
    payoutId: z.string().min(1),
    amountCents: z.number().int().safe().positive(),
    bankPayout: z.enum(["STANDARD", "INSTANT"]).optional(),
  }),
  z.object({
    kind: z.literal("DECLINED"),
    payoutId: z.string().min(1),
    reason: z.string().refine((value) => value.trim() !== ""),
  }),
]);

/** Immutable terminal results, shared by all request keys for a payout attempt. */
export class PostgresPayoutReceipts {
  constructor(private readonly sql: SqlExecutor) {}

  async get(payoutId: UUID): Promise<TerminalWithdrawalResult | null> {
    const key = resultKey(payoutId);
    const rows = await this.sql.query(
      `select status, scope, request_fingerprint, response
         from idempotency_keys where idempotency_key = $1`,
      [key],
    );
    return rows[0] === undefined ? null : readReceipt(rows[0], payoutId);
  }

  async storeIfAbsent(result: TerminalWithdrawalResult): Promise<TerminalWithdrawalResult> {
    const key = resultKey(result.payoutId);
    const rows = await this.sql.query(
      `insert into idempotency_keys
         (idempotency_key, scope, request_fingerprint, status, response, completed_at)
       values ($1, 'UC1-08:result', $2, 'SUCCEEDED', $3::jsonb, now())
       on conflict (idempotency_key) do nothing
       returning status, scope, request_fingerprint, response`,
      [key, fingerprintOf(key), JSON.stringify({ value: receipt.parse(result) })],
    );
    if (rows[0] !== undefined) return readReceipt(rows[0], result.payoutId);
    // A conflicting insert waits for its transaction. READ COMMITTED gives
    // this next statement the committed winner even when it was not visible
    // to the insert's snapshot.
    const existing = await this.get(result.payoutId);
    if (existing === null) throw new SessionPersistenceError("Stored payout receipt was not found");
    return existing;
  }
}

function resultKey(payoutId: UUID): string {
  return JSON.stringify(["UC1-08:result", payoutId]);
}

function readReceipt(row: SqlRow, payoutId: UUID): TerminalWithdrawalResult {
  try {
    if (row.status !== "SUCCEEDED" || row.scope !== "UC1-08:result" ||
        row.request_fingerprint !== fingerprintOf(resultKey(payoutId)))
      throw new Error("Stored payout receipt identity is invalid");
    const envelope = z.object({ value: receipt }).parse(row.response);
    if (envelope.value.payoutId !== payoutId) throw new Error("Stored payout receipt belongs to another attempt");
    return envelope.value;
  } catch (cause) {
    throw new SessionPersistenceError("Stored payout receipt could not be hydrated", { cause });
  }
}
