import { DomainError } from "@/domain";
import { isRequestFailure } from "@/app/http/request-failure";
import { NotificationsUnavailableError } from "./dependencies";

export function notificationErrorResponse(error: unknown) {
  const failure = isRequestFailure(error) ? error
    : error instanceof NotificationsUnavailableError ? { status: 503, code: "NOTIFICATIONS_UNAVAILABLE", message: error.message }
    : error instanceof DomainError && ["INACTIVE_ACCOUNT", "NOT_FOUND"].includes(error.code) ? { status: 403, code: error.code, message: error.message }
    : { status: 500, code: "INTERNAL_ERROR", message: "Notifications could not be updated. Try again." };
  return Response.json({ error: { code: failure.code, message: failure.message } }, {
    status: failure.status, headers: { "Cache-Control": "no-store" },
  });
}
