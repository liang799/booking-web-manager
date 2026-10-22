import type { Region, Sport, UUID } from "@/domain";
import type { Clock } from "../shared/contracts";

/** A place reserved for the player by someone who withdrew and named them (ADR-0006). */
export interface ReplacementInvitation {
  readonly sessionId: UUID;
  readonly venueName: string;
  readonly sport: Sport;
  readonly region: Region;
  readonly startAt: Date;
  readonly endAt: Date;
  /** The share held from the player's wallet on accepting, in integer cents. */
  readonly bookingShareCents: number;
}

/**
 * Reads the pending personal reservations naming the player in OPEN sessions
 * that have not started, ordered by start time, then session ID. A
 * reservation is pending under the domain's `personalReplacementReservations`
 * rule: a WITHDRAWN DIRECT_INVITE participation whose hold is
 * AWAITING_REPLACEMENT or REFUNDED and that nobody has replaced yet. The list
 * is complete (no limit): the accept screen treats an invitation missing from
 * it as resolved.
 */
export interface ReplacementInvitationsReader {
  list(userId: UUID, now: Date): Promise<readonly ReplacementInvitation[]>;
}

/**
 * UC2-05: the replacement invitations a player can still accept. Read-only;
 * the caller supplies the authenticated user ID, never a client-chosen one.
 */
export class ListReplacementInvitations {
  constructor(
    private readonly dependencies: {
      readonly reader: ReplacementInvitationsReader;
      readonly clock: Clock;
    },
  ) {}

  async forInvitee(userId: UUID): Promise<readonly ReplacementInvitation[]> {
    return this.dependencies.reader.list(userId, this.dependencies.clock.now());
  }
}
