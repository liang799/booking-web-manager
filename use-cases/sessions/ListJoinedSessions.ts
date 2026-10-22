import type { Region, Sport, UUID } from "@/domain";
import type { Clock } from "../shared/contracts";

/** A place the player holds (COMMITTED) or is queuing for (WAITLISTED), without roster or payment details. */
export interface JoinedSession {
  readonly sessionId: UUID;
  readonly venueName: string;
  readonly sport: Sport;
  readonly region: Region;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly status: "COMMITTED" | "WAITLISTED";
  /** The session's per-place share in integer cents; held only while COMMITTED. */
  readonly bookingShareCents: number;
}

/**
 * Reads the player's COMMITTED and WAITLISTED places in OPEN sessions that
 * have not started, ordered by start time, then session ID. The list is
 * complete (no limit): the withdrawal screens treat a place missing from it
 * as gone when resolving an unconfirmed request.
 */
export interface JoinedSessionsReader {
  list(userId: UUID, now: Date): Promise<readonly JoinedSession[]>;
}

/**
 * UC2-05: the places a player can still withdraw from or leave. Read-only;
 * the caller supplies the authenticated user ID, never a client-chosen one.
 */
export class ListJoinedSessions {
  constructor(
    private readonly dependencies: {
      readonly reader: JoinedSessionsReader;
      readonly clock: Clock;
    },
  ) {}

  async forParticipant(userId: UUID): Promise<readonly JoinedSession[]> {
    return this.dependencies.reader.list(userId, this.dependencies.clock.now());
  }
}
