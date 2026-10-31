import { ZodError } from "zod";
import type { Money, UUID } from "@/domain";
import { fromDatabaseCents } from "@/lib/money/cents";
import { LedgerError } from "@/lib/money/errors";
import { PostgresLedgerReader } from "@/lib/money/ledger-read-adapter";
import { date, text } from "@/lib/sessions/postgres-row-values";
import type {
  ActiveWalletHold, WalletHistoryQuery, WalletHistoryTransaction, WalletReader,
} from "@/use-cases/wallet/contracts";

/** Adds the wallet's active-hold projection to the ledger's existing reads. */
export class PostgresWalletReader extends PostgresLedgerReader implements WalletReader {
  /** Enrich only the bounded ledger page; session joins cannot change its cursor or order. */
  override async listWalletTransactions(query: WalletHistoryQuery): Promise<readonly WalletHistoryTransaction[]> {
    const transactions = await super.listWalletTransactions(query);
    if (transactions.length === 0) return [];
    const rows = await this.query(
      `select e.entry_id, s.sport
         from ledger_entries e
         left join sessions s on s.session_id = e.session_id
        where e.wallet_id = $1 and e.entry_id = any($2::uuid[])`,
      [query.walletId, transactions.map((transaction) => transaction.transactionId)],
    );
    try {
      const sports = new Map(rows.map((row) => [
        text(row.entry_id), row.sport == null ? undefined : text(row.sport),
      ]));
      return transactions.map((transaction) => ({
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        kind: transaction.kind,
        occurredAt: transaction.occurredAt,
        idempotencyKey: transaction.idempotencyKey,
        externalReference: transaction.externalReference,
        walletId: transaction.walletId,
        holdId: transaction.holdId,
        payoutId: transaction.payoutId,
        sport: sports.get(transaction.transactionId),
      }));
    } catch (cause) {
      if (cause instanceof ZodError) {
        throw new LedgerError("INVARIANT_VIOLATED", "Wallet transaction contains malformed session details", { cause });
      }
      throw cause;
    }
  }

  /**
   * Withdrawal intent is recorded before contacting Stripe. The payable ledger
   * projection cannot represent this: settlement and payout are appended together
   * only after Stripe confirms the transfer.
   */
  async getPendingPayoutAmount(userId: UUID): Promise<Money> {
    const rows = await this.query(
      `select coalesce(sum(pa.amount_cents), 0) as pending_cents
         from payout_attempts pa
         join sessions s on s.session_id = pa.session_id
        where s.booker_id = $1 and pa.status = 'REQUESTED'`,
      [userId],
    );
    const pending = fromDatabaseCents(rows[0]?.pending_cents, "pending_cents");
    if (pending.toCents() < 0) {
      throw new LedgerError("INVARIANT_VIOLATED", "Pending payouts cannot be negative");
    }
    return pending;
  }

  async listActiveHolds(walletId: UUID): Promise<readonly ActiveWalletHold[]> {
    const rows = await this.query(
      `select h.hold_id, h.session_id, h.held_cents, h.original_cents, h.created_at,
              s.venue_name, s.sport, s.start_at, s.booker_id
         from hold_balances h
         left join sessions s on s.session_id = h.session_id
        where h.wallet_id = $1 and h.held_cents > 0
        order by h.created_at desc`,
      [walletId],
    );
    try {
      return rows.map((row) => ({
        holdId: text(row.hold_id),
        sessionId: text(row.session_id),
        bookerId: row.booker_id == null ? undefined : text(row.booker_id),
        heldAmount: fromDatabaseCents(row.held_cents, "held_cents"),
        originalAmount: fromDatabaseCents(row.original_cents, "original_cents"),
        createdAt: date(row.created_at),
        venueName: row.venue_name == null ? undefined : text(row.venue_name),
        sport: row.sport == null ? undefined : text(row.sport),
        startAt: row.start_at == null ? undefined : date(row.start_at),
      }));
    } catch (cause) {
      if (cause instanceof ZodError) {
        throw new LedgerError("INVARIANT_VIOLATED", "Wallet hold contains malformed stored values", { cause });
      }
      throw cause;
    }
  }
}
