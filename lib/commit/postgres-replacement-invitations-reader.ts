import type { UUID } from "@/domain";
import { fromDatabaseCents } from "@/lib/money/cents";
import type { SqlExecutor } from "@/lib/money/sql";
import { date, text } from "@/lib/sessions/postgres-row-values";
import type {
  ReplacementInvitation,
  ReplacementInvitationsReader,
} from "@/use-cases/sessions/ListReplacementInvitations";

/**
 * Pending personal replacement reservations naming the player (UC2-05,
 * ADR-0006), in upcoming open sessions. The reservation predicate mirrors the
 * domain's `personalReplacementReservations`, as `PostgresDueSessionQuery`
 * does: a WITHDRAWN DIRECT_INVITE participation whose hold is
 * AWAITING_REPLACEMENT (late) or REFUNDED (early) and that no participation
 * replaces yet. One autocommit read; the withdrawer's identity is not exposed.
 */
export class PostgresReplacementInvitationsReader implements ReplacementInvitationsReader {
  constructor(private readonly sql: SqlExecutor) {}

  async list(userId: UUID, now: Date): Promise<readonly ReplacementInvitation[]> {
    const rows = await this.sql.query(
      `select s.session_id, s.venue_name, s.sport, s.region, s.start_at, s.end_at,
              s.booking_share_cents
       from participations p
       join fund_holds h on h.participation_id = p.participation_id
       join sessions s on s.session_id = p.session_id
       where p.replacement_invitee_id = $1
         and p.status = 'WITHDRAWN'
         and p.replacement_mode = 'DIRECT_INVITE'
         and h.state in ('AWAITING_REPLACEMENT', 'REFUNDED')
         and not exists (
           select 1 from participations r
           where r.replaces_participation_id = p.participation_id
         )
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
      bookingShareCents: fromDatabaseCents(row.booking_share_cents, "booking_share_cents").toCents(),
    }));
  }
}
