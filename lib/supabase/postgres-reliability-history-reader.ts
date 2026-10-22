import type { ParticipationHistoryEntry, UUID } from "@/domain";
import type { SqlExecutor } from "@/lib/money/sql";
import { hydrateParticipation } from "@/lib/sessions/postgres-participation-reader";
import { date, SessionPersistenceError, text } from "@/lib/sessions/postgres-row-values";
import type { ReliabilityHistoryReader } from "@/use-cases/accounts/get-reliability-score";

/**
 * Reads a user's participations and their sessions' end times for the reliability score.
 * Uses the same rows and mapping as the session user reader, without loading the wallet ledger
 * or taking row locks, because Settings and the sidebar only display the score.
 */
export class PostgresReliabilityHistoryReader implements ReliabilityHistoryReader {
  constructor(private readonly sql: SqlExecutor) {}

  async historyFor(userId: UUID): Promise<readonly ParticipationHistoryEntry[]> {
    const rows = await this.sql.query(
      `select p.*, s.end_at, h.hold_id, h.participation_id as hold_participation_id,
              h.holding_account_id, h.wallet_id, h.payout_id, h.amount_cents,
              h.state as hold_state, h.created_at as hold_created_at, h.settled_at
       from participations p join sessions s on s.session_id = p.session_id
       left join fund_holds h on h.participation_id = p.participation_id
       where p.user_id = $1 order by p.participation_id`,
      [userId],
    );
    if (rows.length === 0) return [];
    const wallets = await this.sql.query("select wallet_id from wallets where user_id = $1", [userId]);
    const wallet = wallets[0];
    if (wallet === undefined) throw new SessionPersistenceError("Stored user has no wallet");
    // Keep SQL failures outside this wrapper so they are not reported as bad stored data.
    try {
      const walletId = text(wallet.wallet_id);
      return rows.map((row) => ({ participation: hydrateParticipation(row, walletId), endAt: date(row.end_at) }));
    } catch (cause) {
      throw new SessionPersistenceError("Stored participation history could not be hydrated", { cause });
    }
  }
}
