import { DomainError, type AccountStatus, type ParticipationStatus, type Region, type SessionStatus, type Sport, type UUID, type Visibility } from "@/domain";
import type { Clock } from "../shared/contracts";

export type SessionFeedTab = "joined" | "hosting";
export type SessionFeedSection = "upcoming" | "past";

export interface PersonalSession {
  readonly sessionId: UUID;
  readonly venueName: string;
  readonly sport: Sport;
  readonly region: Region;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly capacity: number;
  readonly participantCount: number;
  readonly bookingShareCents: number;
  readonly visibility: Visibility;
  readonly status: SessionStatus;
  readonly role: "HOST" | "PARTICIPANT";
  readonly participationStatus: ParticipationStatus | null;
  readonly section: SessionFeedSection;
  readonly unverifiedCount: number;
}

export interface SessionFeedPosition {
  readonly section: SessionFeedSection;
  readonly startAt: Date;
  readonly sessionId: UUID;
}

export interface SessionFeedQuery {
  readonly userId: UUID;
  readonly tab: SessionFeedTab;
  readonly asOf: Date;
  readonly after?: SessionFeedPosition;
  readonly limit: number;
}

export interface SessionFeedRead {
  readonly accountStatus: AccountStatus | null;
  readonly sessions: readonly PersonalSession[];
  readonly upcomingCount: number;
  readonly pastCount: number;
}

/** One snapshot checks account access, scopes enrollment, counts, and reads a bounded page.
 * Upcoming rows sort by start ascending; history sorts descending, with ID ascending ties.
 */
export interface SessionFeedReader {
  read(input: SessionFeedQuery): Promise<SessionFeedRead>;
}

export interface SessionFeedPage {
  readonly sessions: readonly PersonalSession[];
  readonly next: SessionFeedPosition | null;
  readonly asOf: Date;
  readonly upcomingCount: number;
  readonly pastCount: number;
}

export const SESSION_FEED_PAGE_SIZE = 12;

export class ListSessionFeed {
  constructor(private readonly dependencies: { readonly reader: SessionFeedReader; readonly clock: Clock }) {}

  async list(userId: UUID, input: {
    readonly tab: SessionFeedTab;
    readonly asOf?: Date;
    readonly after?: SessionFeedPosition;
  }): Promise<SessionFeedPage> {
    const asOf = input.asOf ?? this.dependencies.clock.now();
    const result = await this.dependencies.reader.read({
      userId, tab: input.tab, asOf, after: input.after, limit: SESSION_FEED_PAGE_SIZE + 1,
    });
    DomainError.require(result.accountStatus !== null, "NOT_FOUND", "User not found");
    DomainError.require(result.accountStatus === "ACTIVE", "INACTIVE_ACCOUNT", "An inactive account cannot view sessions");
    const sessions = result.sessions.slice(0, SESSION_FEED_PAGE_SIZE);
    const last = sessions.at(-1);
    return {
      sessions,
      asOf,
      upcomingCount: result.upcomingCount,
      pastCount: result.pastCount,
      next: result.sessions.length > SESSION_FEED_PAGE_SIZE && last
        ? { section: last.section, startAt: last.startAt, sessionId: last.sessionId } : null,
    };
  }
}
