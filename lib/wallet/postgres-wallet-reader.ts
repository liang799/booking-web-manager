import type { UUID } from "@/domain";
import { fromDatabaseCents } from "@/lib/money/cents";
import { PostgresLedgerReader } from "@/lib/money/ledger-read-adapter";
import type { SqlExecutor } from "@/lib/money/sql";
import { date, text } from "@/lib/sessions/postgres-row-values";
import type { ActiveWalletHold, WalletReader } from "@/use-cases/wallet/contracts";

/** Adds the wallet's active-hold projection to the ledger's existing reads. */
export class PostgresWalletReader extends PostgresLedgerReader implements WalletReader {
  constructor(private readonly sql: SqlExecutor) {
    super(sql);
  }

  async listActiveHolds(walletId: UUID): Promise<readonly ActiveWalletHold[]> {
    const rows = await this.sql.query(
      `select h.hold_id, h.session_id, h.held_cents, h.original_cents, h.created_at,
              s.venue_name, s.sport, s.start_at
         from hold_balances h
         left join sessions s on s.session_id = h.session_id
        where h.wallet_id = $1 and h.held_cents > 0
        order by h.created_at desc`,
      [walletId],
    );
    return rows.map((row) => ({
      holdId: text(row.hold_id),
      sessionId: text(row.session_id),
      heldAmount: fromDatabaseCents(row.held_cents, "held_cents"),
      originalAmount: fromDatabaseCents(row.original_cents, "original_cents"),
      createdAt: date(row.created_at),
      venueName: row.venue_name == null ? undefined : text(row.venue_name),
      sport: row.sport == null ? undefined : text(row.sport),
      startAt: row.start_at == null ? undefined : date(row.start_at),
    }));
  }
}
