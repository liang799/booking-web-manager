import type { Pool } from "pg";
import { z } from "zod";
import { MAX_STORED_SESSION_SLOTS } from "@/domain/sessions/capacity";
import { PostgresTransactor } from "@/lib/database/postgres-transactor";
import { fromDatabaseCents } from "@/lib/money/cents";
import type { InvitedSession, InvitedSessionReader } from "@/use-cases/sessions/GetInvitedSession";
import { date, text } from "./postgres-row-values";

/** A token-bound summary query, without account hydration, roster reads or mutations. */
export class PostgresInvitedSessionReader implements InvitedSessionReader {
  constructor(private readonly getPool: () => Pool) {}

  findByToken(sessionId: string, roomToken: string, now: Date): Promise<InvitedSession | null> {
    return new PostgresTransactor(this.getPool()).transaction(async (sql) => {
      const rows = await sql.query(
        `select session_id, venue_name, sport, region, start_at, end_at,
                total_slots, booking_share_cents
         from sessions
         where session_id = $1 and room_token = $2 and status = 'OPEN' and start_at > $3`,
        [sessionId, roomToken, now],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        sessionId: text(row.session_id),
        venueName: text(row.venue_name),
        sport: text(row.sport),
        region: text(row.region),
        startAt: date(row.start_at),
        endAt: date(row.end_at),
        totalSlots: z.number().int().min(1).max(MAX_STORED_SESSION_SLOTS).parse(row.total_slots),
        bookingShareCents: fromDatabaseCents(row.booking_share_cents, "booking_share_cents").toCents(),
      };
    });
  }
}
