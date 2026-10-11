import type { AcceptReplacement, LoadReplacementInvitations, ReplacementInvitation } from "../replacement-ports";

/**
 * Fake UC2-05 transport and sample data for the accept-replacement stories, until an API lists a
 * player's pending invitations. The acceptance follows POST /api/sessions/replacements/accept.
 */
export const futsalInvitation: ReplacementInvitation = {
  sessionId: "66666666-6666-4666-8666-666666666666", venueName: "Our Tampines Hub", sport: "Futsal", region: "East",
  startAt: "2045-04-15T11:00:00Z", endAt: "2045-04-15T13:00:00Z", bookingShareCents: 900,
};
export const squashInvitation: ReplacementInvitation = {
  sessionId: "88888888-8888-4888-8888-888888888888", venueName: "Toa Payoh Squash Centre", sport: "Squash", region: "Central",
  startAt: "2045-04-16T02:00:00Z", endAt: "2045-04-16T03:00:00Z", bookingShareCents: 1575,
};
export const replacementInvitations: readonly ReplacementInvitation[] = [futsalInvitation, squashInvitation];

export const fakeLoadReplacementInvitations: LoadReplacementInvitations = async () => replacementInvitations;

/** The server holds the session's stored share; the browser never sends an amount. */
export const fakeAcceptReplacement: AcceptReplacement = async (request) => {
  const invitation = replacementInvitations.find((candidate) => candidate.sessionId === request.sessionId);
  return invitation === undefined
    ? { status: "error", code: "INVALID_ACCESS", message: "This invitation is no longer available. Refresh to see your invitations.", unconfirmed: false }
    : { status: "accepted", heldCents: invitation.bookingShareCents };
};
