import { playerSessionsGetAction } from "@/app/commit/player-sessions-action";
import { toReplacementInvitationsResponse } from "@/app/commit/player-sessions-response";

export const runtime = "nodejs";

/** UC2-05: places reserved for the authenticated player by withdrawals that named them. */
export const GET = playerSessionsGetAction({
  parse: (userId) => userId,
  run: (dependencies, userId) => dependencies.listReplacementInvitations.forInvitee(userId),
  serialize: toReplacementInvitationsResponse,
});
