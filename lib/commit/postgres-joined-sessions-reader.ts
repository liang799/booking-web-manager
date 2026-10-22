import type { UUID } from "@/domain";
import { fromDatabaseCents } from "@/lib/money/cents";
import type { SqlExecutor } from "@/lib/money/sql";
import { choice, date, text } from "@/lib/sessions/postgres-row-values";
import type { JoinedSession, JoinedSessionsReader } from "@/use-cases/sessions/ListJoinedSessions";

/**
 * The player's own active places in upcoming open sessions (UC2-05). One
 * autocommit read keyed by the authenticated user; it exposes no room token,
 * roster or ledger data. The share is the session's stored
 * `booking_share_cents`, never recalculated from the booking cost.
 */
export class PostgresJoinedSessionsReader implements JoinedSessionsReader {
  constructor(private readonly sql: SqlExecutor) {}

  async list(userId: UUID, now: Date): Promise<readonly JoinedSession[]> {
    const rows = await this.sql.query(
      `select s.session_id, s.venue_name, s.sport, s.region, s.start_at, s.end_at,
              s.booking_share_cents, p.status
       from participations p
       join sessions s on s.session_id = p.session_id
       where p.user_id = $1
         and p.status in ('COMMITTED', 'WAITLISTED')
         and s.status = 'OPEN'
         and s.start_at > $2
       order by s.start_at asc, s.session_id asc`,
      [userId, now],
    );
    return rows.map((row) => ({
      sessionId: text(row.session_id),
      venueName: text(row.venue_name),
      sport: text(row.sport),
      region: text(row.region),
      startAt: date(row.start_at),
      endAt: date(row.end_at),
      status: choice(row.status, ["COMMITTED", "WAITLISTED"] as const),
      bookingShareCents: fromDatabaseCents(row.booking_share_cents, "booking_share_cents").toCents(),
    }));
  }
}
