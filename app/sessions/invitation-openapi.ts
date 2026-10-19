import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { errorResponse } from "@/app/openapi/contracts";
import { sessionInvitationParamsSchema, sessionInvitationResponseSchema } from "./invitation-contract";
import { SESSION_MANAGEMENT_UNAVAILABLE_MESSAGE } from "./session-management-unavailable";

export function registerSessionInvitationApi(registry: OpenAPIRegistry): void {
  const result = registry.register("SessionInvitation", sessionInvitationResponseSchema);
  registry.registerPath({
    method: "get",
    path: "/api/sessions/{sessionId}/invitation",
    operationId: "getSessionInvitation",
    tags: ["Sessions"],
    summary: "Get a hosted session's invitation link",
    description: "Requires the active owner of an OPEN session that has not started. Full sessions remain shareable so invitees can join the waitlist. Returns the existing token in a same-origin invitationPath; it does not rotate tokens, change visibility, or move money. Bearer identity or same-origin Supabase login cookies are accepted. Success and errors use Cache-Control: no-store. The invitation page checks the exact token and exposes only safe session display facts; joining separately rechecks admission and funds.",
    security: [{ bearerAuth: [] }, { loginCookie: [] }],
    request: { params: sessionInvitationParamsSchema },
    responses: {
      200: { description: "Owner-only invitation link.", content: { "application/json": { schema: result } } },
      400: errorResponse("Malformed session ID.", "INVALID_REQUEST", "Invalid session invitation request"),
      401: errorResponse("Missing or invalid authentication.", "UNAUTHENTICATED", "Authentication is required"),
      403: errorResponse("Inactive account or another session's owner.", "UNAUTHORIZED", "Only the booker can manage this session"),
      404: errorResponse("User or session does not exist.", "NOT_FOUND", "Session was not found"),
      409: errorResponse("Session is started or closed.", "SESSION_STARTED", "This session has already started"),
      500: errorResponse("Unexpected failure; internal details are redacted.", "INTERNAL_ERROR", "Internal server error"),
      503: errorResponse("Required server settings are missing.", "SESSION_MANAGEMENT_UNAVAILABLE", SESSION_MANAGEMENT_UNAVAILABLE_MESSAGE),
    },
  });
}
