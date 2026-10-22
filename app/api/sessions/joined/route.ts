import { playerSessionsGetAction } from "@/app/commit/player-sessions-action";
import { toJoinedSessionsResponse } from "@/app/commit/player-sessions-response";

export const runtime = "nodejs";

/** UC2-05: the authenticated player's places in upcoming sessions, committed or waitlisted. */
export const GET = playerSessionsGetAction({
  parse: (userId) => userId,
  run: (dependencies, userId) => dependencies.listJoinedSessions.forParticipant(userId),
  serialize: toJoinedSessionsResponse,
});
