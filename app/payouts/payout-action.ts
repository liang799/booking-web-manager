import { DomainError, type UUID } from "@/domain";
import { createAuthenticatedActions } from "@/app/http/authenticated-action";
import { isRequestFailure } from "@/app/http/request-failure";
import { LedgerError } from "@/lib/money/errors";
import { PayoutProviderError } from "@/use-cases/payouts/SetUpPayoutAccount";
import {
  PAYOUTS_UNAVAILABLE_MESSAGE,
  PayoutsUnavailableError,
  type PayoutDependencies,
} from "./payout-dependencies";

const domainErrorStatuses: Partial<Record<DomainError["code"], number>> = {
  INVALID_INPUT: 422,
  UNAUTHORIZED: 403,
  INACTIVE_ACCOUNT: 403,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  PAYOUT_ACCOUNT_NOT_READY: 409,
  SESSION_CLOSED: 409,
  SESSION_NOT_ENDED: 409,
  ATTENDANCE_INCOMPLETE: 409,
  PAYOUT_IN_PROGRESS: 409,
  STALE_PAYOUT: 409,
  PAYOUT_CONFLICT: 409,
};

/** A reused or concurrently retried idempotency key. */
const ledgerConflicts = new Set(["IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_IN_FLIGHT"]);

export type PayoutRun<Output> = (
  dependencies: PayoutDependencies,
  userId: UUID,
  request: Request,
) => Promise<Output>;

/**
 * Builds one payout route handler. Owns the shared HTTP policy: loading the
 * cached dependencies, authentication, error mapping and `no-store` responses.
 * The acting user always comes from authentication; the callback owns any body parsing.
 */
export function payoutAction<Output>(
  loader: () => Promise<PayoutDependencies>,
  run: PayoutRun<Output>,
): (request: Request) => Promise<Response> {
  const actions = createAuthenticatedActions({
    getDependencies: loader,
    errorResponse: payoutErrorResponse,
  });
  return actions.get({
    parse: (userId, _params, request) => ({ userId, request }),
    run: (dependencies, input) => run(dependencies, input.userId, input.request),
  });
}

/** Maps failures to `{ error: { code, message } }` without exposing internals. */
export function payoutErrorResponse(error: unknown): Response {
  if (isRequestFailure(error)) return errorResponse(error.status, error.code, error.message);
  if (error instanceof PayoutsUnavailableError)
    return errorResponse(503, "PAYOUTS_UNAVAILABLE", PAYOUTS_UNAVAILABLE_MESSAGE);
  if (error instanceof PayoutProviderError)
    return errorResponse(
      502,
      "PAYOUT_PROVIDER_UNAVAILABLE",
      "Stripe could not be reached. Please try again.",
    );
  if (error instanceof DomainError) {
    const status = domainErrorStatuses[error.code];
    if (status !== undefined) return errorResponse(status, error.code, error.message);
  }
  if (error instanceof LedgerError && ledgerConflicts.has(error.code))
    return errorResponse(
      409,
      error.code,
      "This request is already being processed, or its key was used for a different request",
    );
  return errorResponse(500, "INTERNAL_ERROR", "Internal server error");
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** Stripe returns the user to this site's /payouts page after onboarding. */
export function onboardingLinksFor(request: Request): {
  readonly returnUrl: string;
  readonly refreshUrl: string;
} {
  const origin = new URL(request.url).origin;
  return {
    returnUrl: `${origin}/payouts?onboarding=return`,
    refreshUrl: `${origin}/payouts?onboarding=refresh`,
  };
}
