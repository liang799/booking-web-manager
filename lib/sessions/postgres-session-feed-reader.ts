import { z } from "zod";
import { fromDatabaseCents } from "@/lib/money/cents";
import type { SqlExecutor, SqlRow } from "@/lib/money/sql";
import type { PersonalSession, SessionFeedQuery, SessionFeedRead, SessionFeedReader } from "@/use-cases/sessions/ListSessionFeed";
import { choice, date, SessionPersistenceError, text } from "./postgres-row-values";

const count = (value: unknown) => z.number().int().safe().nonnegative().parse(value);

/** Reads only personal summaries. Neither invitation secrets nor another player's identity is selected. */
export class PostgresSessionFeedReader implements SessionFeedReader {
  constructor(private readonly sql: SqlExecutor) {}

  async read(input: SessionFeedQuery): Promise<SessionFeedRead> {
    const rows = await this.sql.query(
      `with account as (
         select account_status from profiles where user_id = $1
       ), eligible as (
         select s.session_id, s.venue_name, s.sport, s.region, s.start_at, s.end_at,
                s.total_slots, s.booking_share_cents, s.visibility, s.status,
                mine.status as participation_status,
                case when s.status = 'OPEN' and s.end_at > $3
                       and ($2 = 'hosting' or mine.status in ('COMMITTED', 'WAITLISTED'))
                     then 0 else 1 end as section_order
         from sessions s
         left join participations mine on mine.session_id = s.session_id and mine.user_id = $1
         where exists (select 1 from account where account_status = 'ACTIVE')
           and (($2 = 'hosting' and s.booker_id = $1)
             or ($2 = 'joined' and s.booker_id <> $1 and mine.user_id = $1))
       ), totals as (
         select count(*) filter (where section_order = 0)::integer as upcoming_count,
                count(*) filter (where section_order = 1)::integer as past_count
         from eligible
       ), page as (
         select * from eligible
         where $4::integer is null or section_order > $4
            or (section_order = $4 and (
              (section_order = 0 and start_at > $5::timestamptz)
              or (section_order = 1 and start_at < $5::timestamptz)
              or (start_at = $5::timestamptz and session_id > $6::uuid)
            ))
         order by section_order,
                  case when section_order = 0 then start_at end asc,
                  case when section_order = 1 then start_at end desc, session_id asc
         limit $7
       )
       select (select account_status from account) as account_status,
              totals.upcoming_count, totals.past_count, page.*,
              (select count(*)::integer from participations p
               where p.session_id = page.session_id and p.status = 'COMMITTED') as participant_count,
              case when $2 = 'hosting' and page.status = 'OPEN' and page.end_at <= $3
                then (select count(*)::integer from participations p
                  where p.session_id = page.session_id and p.status = 'COMMITTED'
                    and p.attendance = 'UNVERIFIED') else 0 end as unverified_count
       from totals left join page on true
       order by page.section_order,
                case when page.section_order = 0 then page.start_at end asc,
                case when page.section_order = 1 then page.start_at end desc, page.session_id asc`,
      [input.userId, input.tab, input.asOf, input.after ? input.after.section === "upcoming" ? 0 : 1 : null,
        input.after?.startAt ?? null, input.after?.sessionId ?? null, input.limit],
    );
    try {
      const first = rows[0];
      if (!first) throw new Error("Session summary was not returned");
      return {
        accountStatus: first.account_status === null ? null : choice(first.account_status, ["ACTIVE", "INACTIVE"]),
        upcomingCount: count(first.upcoming_count),
        pastCount: count(first.past_count),
        sessions: rows.filter((row) => row.session_id !== null).map((row) => toSession(row, input.tab)),
      };
    } catch (cause) {
      throw new SessionPersistenceError("Stored session summary could not be read", { cause });
    }
  }
}

function toSession(row: SqlRow, tab: SessionFeedQuery["tab"]): PersonalSession {
  return {
    sessionId: text(row.session_id),
    venueName: text(row.venue_name),
    sport: text(row.sport),
    region: text(row.region),
    startAt: date(row.start_at),
    endAt: date(row.end_at),
    capacity: z.number().int().positive().parse(row.total_slots),
    participantCount: count(row.participant_count),
    bookingShareCents: fromDatabaseCents(row.booking_share_cents, "booking_share_cents").toCents(),
    visibility: choice(row.visibility, ["PUBLIC", "PRIVATE"]),
    status: choice(row.status, ["OPEN", "CANCELLED", "AWAITING_PAYOUT", "PAYOUT_PENDING", "SETTLED"]),
    role: tab === "hosting" ? "HOST" : "PARTICIPANT",
    participationStatus: row.participation_status === null ? null
      : choice(row.participation_status, ["WAITLISTED", "COMMITTED", "LEFT_WAITLIST", "WITHDRAWN", "REMOVED", "CANCELLED"]),
    section: z.union([z.literal(0), z.literal(1)]).parse(row.section_order) === 0 ? "upcoming" : "past",
    unverifiedCount: count(row.unverified_count),
  };
}
