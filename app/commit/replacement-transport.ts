import { z } from "zod";
import type { AcceptReplacement } from "./replacement-ports";
import { actionFailure, sendAsSignedInUser } from "./session-action-request";

/**
 * UC2-05 production adapter for accepting a replacement invitation. It calls the existing API,
 * validates the reply with Zod and maps it explicitly to the presentation contract:
 *
 * | API reply | Presentation result |
 * | --- | --- |
 * | POST /api/sessions/replacements/accept `{ sessionId, participationId, heldCents, refundedParticipationId? }` | `{ status: "accepted", heldCents }` |
 */
export const ACCEPT_REPLACEMENT_URL = "/api/sessions/replacements/accept";

const acceptResponseSchema = z.object({
  sessionId: z.string(),
  participationId: z.string(),
  heldCents: z.number().int().safe().nonnegative(),
  refundedParticipationId: z.string().optional(),
});

/** What the player is told for each error code the route can return. */
export const ACCEPT_REPLACEMENT_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  UNAUTHENTICATED: "Log in again to accept this invitation.",
  INACTIVE_ACCOUNT: "This account can't join sessions.",
  EMAIL_VERIFICATION_REQUIRED: "Confirm your email address before taking a place.",
  // Replaces EMAIL_VERIFICATION_REQUIRED once email confirmation stops being required (PR #72).
  EMAIL_REQUIRED: "Add an email address to your account before taking a place.",
  INSUFFICIENT_FUNDS: "Your wallet doesn't have enough available balance for this share. Top up your wallet, then try again.",
  LOW_RELIABILITY: "Your reliability score is below this session's minimum.",
  INVALID_ACCESS: "This invitation is no longer available. Refresh to see your invitations.",
  ALREADY_PARTICIPATING: "You're already in this session.",
  REJOIN_NOT_ALLOWED: "You left this session earlier, so you can't take a place in it again.",
  CAPACITY_EXCEEDED: "This session is full.",
  INVALID_STATE: "This session can no longer take a replacement. Refresh to see your invitations.",
  SESSION_STARTED: "This session has already started.",
  SESSION_CLOSED: "This session is closed.",
  NOT_FOUND: "This session no longer exists. Refresh to see your invitations.",
  SESSION_MANAGEMENT_UNAVAILABLE: "Sessions are temporarily unavailable. Please try again later.",
};

export const UNCONFIRMED_ACCEPT_MESSAGE =
  "We couldn't confirm whether you took the place. Try again: the same request is reused, so your share is never held twice.";

/** UC2-05: accepts the player's own invitation. The server holds the share; the browser sends no amount. */
export const acceptReplacement: AcceptReplacement = async (request) => {
  const sent = await sendAsSignedInUser(ACCEPT_REPLACEMENT_URL, {
    method: "POST",
    body: JSON.stringify({ sessionId: request.sessionId, idempotencyKey: request.idempotencyKey }),
  }, { unconfirmed: UNCONFIRMED_ACCEPT_MESSAGE, signedOut: ACCEPT_REPLACEMENT_ERROR_MESSAGES.UNAUTHENTICATED! });
  if (sent.status === "error") return sent;
  if (sent.response.ok) {
    const parsed = acceptResponseSchema.safeParse(sent.body);
    if (parsed.success) return { status: "accepted", heldCents: parsed.data.heldCents };
  }
  return actionFailure(sent, {
    unconfirmed: UNCONFIRMED_ACCEPT_MESSAGE,
    byCode: ACCEPT_REPLACEMENT_ERROR_MESSAGES,
    fallback: "We couldn't accept this invitation. Please try again.",
  });
};
