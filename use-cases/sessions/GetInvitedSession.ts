import type { Region, Sport, UUID } from "@/domain";
import type { Clock } from "../shared/contracts";

/** Safe invitation facts; tokens, owner identities, participants and wallet state never leave the reader. */
export interface InvitedSession {
  readonly sessionId: UUID;
  readonly venueName: string;
  readonly sport: Sport;
  readonly region: Region;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly totalSlots: number;
  readonly bookingShareCents: number;
}

export interface InvitedSessionReader {
  /** Match the exact token and return only an OPEN session strictly after now, or null. */
  findForGroupMember?(
    sessionId: UUID,
    userId: UUID,
    now: Date,
  ): Promise<InvitedSession | null>;
  findByToken(
    sessionId: UUID,
    roomToken: string,
    now: Date,
  ): Promise<InvitedSession | null>;
}

/** One safe preview read with a fresh time boundary; actual joining rechecks all admission rules. */
export class GetInvitedSession {
  constructor(
    private readonly dependencies: {
      readonly reader: InvitedSessionReader;
      readonly clock: Clock;
    },
  ) {}

  forGroupMember(
    sessionId: UUID,
    userId: UUID,
  ): Promise<InvitedSession | null> {
    return (
      this.dependencies.reader.findForGroupMember?.(
        sessionId,
        userId,
        this.dependencies.clock.now(),
      ) ?? Promise.resolve(null)
    );
  }

  byToken(sessionId: UUID, roomToken: string): Promise<InvitedSession | null> {
    return this.dependencies.reader.findByToken(
      sessionId,
      roomToken,
      this.dependencies.clock.now(),
    );
  }
}
