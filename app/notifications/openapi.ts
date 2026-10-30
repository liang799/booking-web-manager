import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { errorResponse, z } from "@/app/openapi/contracts";

export function registerNotificationsApi(registry: OpenAPIRegistry) {
  const cursor = z.object({ createdAt: z.string().datetime(), id: z.string().uuid() });
  const failures = {
    400: errorResponse("Invalid filter, cursor or notification ID.", "INVALID_REQUEST", "Invalid request parameters"),
    401: errorResponse("Authentication required.", "UNAUTHENTICATED", "Authentication is required"),
    403: errorResponse("Inactive account.", "INACTIVE_ACCOUNT", "This account is not active"),
    500: errorResponse("Opaque infrastructure failure.", "INTERNAL_ERROR", "Notifications could not be updated. Try again."),
    503: errorResponse("Missing server settings.", "NOTIFICATIONS_UNAVAILABLE", "Notifications are not available right now"),
  };
  registry.registerPath({
    method: "get", path: "/api/notifications", operationId: "listNotifications", tags: ["Notifications"],
    summary: "Read the signed-in user's notification inbox",
    description: "Returns at most 30 newest-first items. Supply both before and id from nextCursor for the next page. All operations require migration 0018_notification_inbox and return Cache-Control: no-store.",
    security: [{ bearerAuth: [] }, { loginCookie: [] }],
    request: { query: z.object({ filter: z.enum(["all", "bookings", "groups", "payments", "system"]).optional(), before: z.string().datetime().optional(), id: z.string().uuid().optional() }) },
    responses: { ...failures, 200: { description: "Only this recipient's alerts.", content: { "application/json": { schema: z.object({
      items: z.array(z.object({ id: z.string().uuid(), category: z.enum(["bookings", "groups", "payments", "system"]), title: z.string(), body: z.string(), url: z.string(), createdAt: z.string().datetime() })),
      retentionCutoff: z.string().datetime(), nextCursor: cursor.nullable(),
    }) } } } },
  });
}
