import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { errorResponse } from "@/app/openapi/contracts";
import { SESSION_MANAGEMENT_UNAVAILABLE_MESSAGE } from "@/app/sessions/session-management-unavailable";
import {
  joinedSessionsResponseSchema,
  replacementInvitationsResponseSchema,
} from "./player-sessions-response";

const sharedResponses = {
  401: errorResponse("Bearer authentication required.", "UNAUTHENTICATED", "Authentication is required"),
  500: errorResponse("Opaque infrastructure failure.", "INTERNAL_ERROR", "Internal server error"),
  503: errorResponse(
    "Server settings unavailable.",
    "SESSION_MANAGEMENT_UNAVAILABLE",
    SESSION_MANAGEMENT_UNAVAILABLE_MESSAGE,
  ),
};

export function registerPlayerSessionsApi(registry: OpenAPIRegistry): void {
  const joined = registry.register("JoinedSessions", joinedSessionsResponseSchema);
  const invitations = registry.register("ReplacementInvitations", replacementInvitationsResponseSchema);

  registry.registerPath({
    method: "get",
    path: "/api/sessions/joined",
    operationId: "listJoinedSessions",
    tags: ["Sessions"],
    summary: "UC2-05 List the player's joined sessions",
    description: [
      "The authenticated player's places in open sessions that have not started: COMMITTED (share held) or WAITLISTED (nothing held).",
      "These are the places the player can withdraw from or leave. Ordered by start time, then session ID, and complete (no paging).",
      "bookingShareCents is the session's stored share in integer cents. No room token, roster or ledger data.",
      "Requires migrations through 0008_session_pricing.",
    ].join(" "),
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "The player's joined sessions; possibly empty.",
        content: { "application/json": { schema: joined } },
      },
      ...sharedResponses,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/sessions/replacements",
    operationId: "listReplacementInvitations",
    tags: ["Sessions"],
    summary: "UC2-05 List the player's replacement invitations",
    description: [
      "Places reserved for the authenticated player by participants who withdrew and named them (ADR-0006), in open sessions that have not started and that nobody has taken yet.",
      "Accept one with POST /api/sessions/replacements/accept; accepting holds bookingShareCents (integer cents) from the player's wallet.",
      "Ordered by start time, then session ID, and complete (no paging). The withdrawer's identity is not included.",
      "Requires migrations through 0008_session_pricing.",
    ].join(" "),
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "The player's pending invitations; possibly empty.",
        content: { "application/json": { schema: invitations } },
      },
      ...sharedResponses,
    },
  });
}
