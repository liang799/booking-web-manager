import { z } from "@/app/openapi/contracts";
import type { JoinedSession } from "@/use-cases/sessions/ListJoinedSessions";
import type { ReplacementInvitation } from "@/use-cases/sessions/ListReplacementInvitations";

const cents = z.number().int().nonnegative().safe();
const sessionSummary = {
  sessionId: z.string().uuid(),
  venueName: z.string(),
  sport: z.string(),
  region: z.string(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
};

/** GET /api/sessions/joined. */
export const joinedSessionsResponseSchema = z.object({
  sessions: z.array(
    z.object({
      ...sessionSummary,
      status: z.enum(["COMMITTED", "WAITLISTED"]),
      /** Held only while COMMITTED. */
      bookingShareCents: cents,
    }),
  ),
});
export type JoinedSessionsResponse = z.infer<typeof joinedSessionsResponseSchema>;

/** GET /api/sessions/replacements. */
export const replacementInvitationsResponseSchema = z.object({
  invitations: z.array(
    z.object({
      ...sessionSummary,
      /** Held from the invitee's wallet on accepting. */
      bookingShareCents: cents,
    }),
  ),
});
export type ReplacementInvitationsResponse = z.infer<typeof replacementInvitationsResponseSchema>;

export function toJoinedSessionsResponse(sessions: readonly JoinedSession[]): JoinedSessionsResponse {
  return {
    sessions: sessions.map((session) => ({
      sessionId: session.sessionId,
      venueName: session.venueName,
      sport: session.sport,
      region: session.region,
      startAt: session.startAt.toISOString(),
      endAt: session.endAt.toISOString(),
      status: session.status,
      bookingShareCents: session.bookingShareCents,
    })),
  };
}

export function toReplacementInvitationsResponse(
  invitations: readonly ReplacementInvitation[],
): ReplacementInvitationsResponse {
  return {
    invitations: invitations.map((invitation) => ({
      sessionId: invitation.sessionId,
      venueName: invitation.venueName,
      sport: invitation.sport,
      region: invitation.region,
      startAt: invitation.startAt.toISOString(),
      endAt: invitation.endAt.toISOString(),
      bookingShareCents: invitation.bookingShareCents,
    })),
  };
}
