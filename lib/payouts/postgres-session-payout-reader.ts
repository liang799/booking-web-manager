import type { Pool } from "pg";
import type { UUID } from "@/domain";
import { fromDatabaseCents } from "@/lib/money/cents";
import { choice, date, text } from "@/lib/sessions/postgres-row-values";
import type { SessionPayoutItem, SessionPayoutReader } from "@/use-cases/payouts/ListSessionPayouts";

/**
 * The booker's sessions from attendance verification onwards. Amounts follow
 * the settlement rules: a session awaiting payout shows its unsettled holds
 * (attended shares are released, absent and withdrawn ones forfeited, both to
 * the booker); a pending one shows its frozen batch; a settled one shows the
 * completed payout. Settled sessions that paid nothing are omitted.
 */
export class PostgresSessionPayoutReader implements SessionPayoutReader {
  constructor(private readonly getPool: () => Pool) {}

  async listForBooker(bookerId: UUID): Promise<readonly SessionPayoutItem[]> {
    const result = await this.getPool().query(
      `select * from (
         select s.session_id, s.venue_name, s.sport, s.start_at, s.status,
           case s.status
             when 'SETTLED' then coalesce((
               select pa.amount_cents from payout_attempts pa
                where pa.session_id = s.session_id and pa.status = 'COMPLETED'
                order by pa.completed_at desc limit 1), 0)
             when 'PAYOUT_PENDING' then coalesce((
               select sum((line ->> 'amountCents')::bigint)
                 from jsonb_array_elements(s.pending_settlement -> 'lines') line), 0)
             else coalesce((
               select sum(h.amount_cents) from participations p
                 join fund_holds h on h.participation_id = p.participation_id
                where p.session_id = s.session_id
                  and p.status in ('COMMITTED', 'WITHDRAWN')
                  and h.state in ('HELD', 'AWAITING_REPLACEMENT', 'FORFEITURE_DUE')), 0)
           end as amount_cents
           from sessions s
          where s.booker_id = $1 and s.status in ('AWAITING_PAYOUT', 'PAYOUT_PENDING', 'SETTLED')
       ) payouts
       where status <> 'SETTLED' or amount_cents > 0
       order by case status when 'AWAITING_PAYOUT' then 0 when 'PAYOUT_PENDING' then 1 else 2 end,
                start_at desc
       limit 50`,
      [bookerId],
    );
    return result.rows.map((row) => ({
      sessionId: text(row.session_id),
      venueName: text(row.venue_name),
      sport: text(row.sport),
      startAt: date(row.start_at),
      status: choice(row.status, ["AWAITING_PAYOUT", "PAYOUT_PENDING", "SETTLED"]),
      amountCents: fromDatabaseCents(row.amount_cents, "amount_cents").toCents(),
    }));
  }
}
