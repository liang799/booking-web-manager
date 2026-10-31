import { DomainError, type UUID } from "@/domain";
import { isRequestFailure } from "@/app/http/request-failure";
import {
  SESSION_MANAGEMENT_UNAVAILABLE_MESSAGE,
  SessionManagementUnavailableError,
} from "@/app/sessions/session-management-unavailable";
import { z } from "zod";

/** Resolves the verified user ID for a request, or null when signed out. */
export type Authenticate = (request: Request) => Promise<UUID | null>;

export const uuid = z.string().uuid();
export const idempotencyKey = z
  .string()
  .refine((key) => key.trim() !== "", {
    message: "An idempotency key is required",
  });

const domainErrorStatuses: Partial<Record<DomainError["code"], number>> = {
  INVALID_INPUT: 422,
  DUPLICATE_ID: 422,
  UNAUTHORIZED: 403,
  INACTIVE_ACCOUNT: 403,
  EMAIL_REQUIRED: 403,
  INVALID_ACCESS: 403,
  LOW_RELIABILITY: 403,
  NOT_FOUND: 404,
  INSUFFICIENT_FUNDS: 409,
  ALREADY_PARTICIPATING: 409,
  REJOIN_NOT_ALLOWED: 409,
  INVALID_STATE: 409,
  INVALID_INVITATION: 409,
  CAPACITY_EXCEEDED: 409,
  SESSION_CLOSED: 409,
  SESSION_STARTED: 409,
  SESSION_NOT_ENDED: 409,
  ATTENDANCE_CONFLICT: 409,
};

/** Maps an authentication or use-case failure without exposing internals. */
export function commitmentErrorResponse(error: unknown): Response {
  if (isRequestFailure(error)) {
    return errorResponse(error.status, error.code, error.message);
  }
  if (error instanceof SessionManagementUnavailableError) {
    return errorResponse(
      503,
      "SESSION_MANAGEMENT_UNAVAILABLE",
      SESSION_MANAGEMENT_UNAVAILABLE_MESSAGE,
    );
  }
  if (error instanceof DomainError) {
    const status = domainErrorStatuses[error.code];
    if (status !== undefined) {
      return errorResponse(status, error.code, error.message);
    }
  }
  return internalErrorResponse();
}

/** JSON error body `{ error: { code, message } }`, never cached. */
export function errorResponse(status: number, code: string, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** Opaque 500 for failures that must not reveal internal details. */
export function internalErrorResponse(): Response {
  return errorResponse(500, "INTERNAL_ERROR", "Internal server error");
}
