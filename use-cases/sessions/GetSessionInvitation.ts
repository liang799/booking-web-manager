import { DomainError, type UUID } from "@/domain";
import type { Clock } from "../shared/contracts";
import { requireAggregate } from "../shared/helpers";
import { requireParticipantListOwner } from "./participant-removal-preview";
import type { SessionManagementTransaction } from "./session-management-transaction";

export interface SessionInvitation {
  readonly sessionId: UUID;
  readonly roomToken: string;
}

/** Read the existing invitation for an active owner without changing admission or session state. */
export class GetSessionInvitation {
  constructor(private readonly dependencies: {
    readonly transaction: SessionManagementTransaction;
    readonly clock: Clock;
  }) {}

  async forBooker(bookerId: UUID, sessionId: UUID): Promise<SessionInvitation> {
    return this.dependencies.transaction.run(async ({ users, sessions }) => {
      const user = await requireAggregate(users, bookerId, "User");
      DomainError.require(user.accountStatus === "ACTIVE", "INACTIVE_ACCOUNT", "An inactive account cannot manage sessions");
      const session = await requireAggregate(sessions, sessionId, "Session");
      requireParticipantListOwner(user, session);
      const now = this.dependencies.clock.now();
      DomainError.require(session.status === "OPEN", "SESSION_CLOSED", "This session is closed");
      DomainError.require(now < session.booking.startAt, "SESSION_STARTED", "This session has already started");
      // Full sessions still accept a waitlist; reading a link never changes visibility or funds.
      return { sessionId: session.sessionId, roomToken: session.roomToken };
    });
  }
}
