import { DomainError } from "@/domain";
import { isRequestFailure } from "@/app/http/request-failure";
import { LedgerError } from "@/lib/money/errors";
import {
  SESSION_API_UNAVAILABLE_MESSAGE,
  SessionApiUnavailableError,
} from "./session-api-unavailable";

const domainErrorStatuses: Partial<Record<DomainError["code"], number>> = {
  INVALID_INPUT: 422,
  INACTIVE_ACCOUNT: 403,
  EMAIL_REQUIRED: 403,
  UNAUTHORIZED: 403,
  NOT_FOUND: 404,
  PAYOUT_ACCOUNT_NOT_READY: 409,
  SESSION_STARTED: 409,
};

export function sessionCreationErrorResponse(error: unknown): Response {
  if (isRequestFailure(error)) {
    return errorResponse(error.status, error.code, error.message);
  }
  if (error instanceof SessionApiUnavailableError) {
    return errorResponse(503, "SESSION_API_UNAVAILABLE", SESSION_API_UNAVAILABLE_MESSAGE);
  }
  if (error instanceof LedgerError && error.code === "IDEMPOTENCY_CONFLICT") {
    return errorResponse(409, error.code, "This submission key was already used for different booking details");
  }
  if (error instanceof LedgerError && error.code === "IDEMPOTENCY_IN_FLIGHT") {
    return errorResponse(409, error.code, "This submission is already being processed");
  }
  if (error instanceof DomainError) {
    const status = domainErrorStatuses[error.code];
    if (status !== undefined) {
      return errorResponse(status, error.code, error.message);
    }
  }
  return internalErrorResponse();
}

export function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function internalErrorResponse(): Response {
  return errorResponse(500, "INTERNAL_ERROR", "Internal server error");
}
