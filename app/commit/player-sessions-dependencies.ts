import type { UUID } from "@/domain";
import type { ListJoinedSessions } from "@/use-cases/sessions/ListJoinedSessions";
import type { ListReplacementInvitations } from "@/use-cases/sessions/ListReplacementInvitations";

/** App-owned capabilities for the player's UC2-05 lists (joined sessions, replacement invitations). */
export interface PlayerSessionsDependencies {
  readonly authenticate: (request: Request) => Promise<UUID | null>;
  readonly listJoinedSessions: Pick<ListJoinedSessions, "forParticipant">;
  readonly listReplacementInvitations: Pick<ListReplacementInvitations, "forInvitee">;
}
