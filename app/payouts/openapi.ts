import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { errorResponse, z } from "@/app/openapi/contracts";
import { PAYOUTS_UNAVAILABLE_MESSAGE } from "./payout-dependencies";

const payoutSetupSchema = z.object({
  status: z.enum(["NOT_STARTED", "PENDING", "COMPLETE", "FAILED"]),
  onboardingUrl: z.string().url().optional(),
  instantPayoutsAvailable: z.boolean().optional(),
});

const sharedErrors = {
  401: errorResponse(
    "Missing, invalid or expired Supabase bearer token.",
    "UNAUTHENTICATED",
    "Authentication is required",
  ),
  403: errorResponse(
    "The authenticated account is deactivated.",
    "INACTIVE_ACCOUNT",
    "An active account is required",
  ),
  404: errorResponse("The authenticated user has no profile.", "NOT_FOUND", "The profile was not found"),
  500: errorResponse("Unexpected server or database error.", "INTERNAL_ERROR", "Internal server error"),
  502: errorResponse(
    "Stripe could not complete the request.",
    "PAYOUT_PROVIDER_UNAVAILABLE",
    "Stripe could not be reached. Please try again.",
  ),
  503: errorResponse(
    "The database or Stripe test-mode settings are missing.",
    "PAYOUTS_UNAVAILABLE",
    PAYOUTS_UNAVAILABLE_MESSAGE,
  ),
};

export function registerPayoutApi(registry: OpenAPIRegistry): void {
  const setupSchema = registry.register("PayoutSetup", payoutSetupSchema);

  registry.registerPath({
    method: "get",
    path: "/api/payouts/account",
    operationId: "getPayoutSetup",
    tags: ["Payouts"],
    summary: "UC1-07 Get payout account setup",
    description:
      "Returns the authenticated user's payout setup. A pending setup is refreshed from Stripe, so it completes even if a webhook was missed. A booker needs a COMPLETE setup before creating a session. Bank and card details stay with Stripe; this API never returns them. instantPayoutsAvailable reports whether the destination is a debit card eligible for instant payouts.",
    security: [{ bearerAuth: [] }, { loginCookie: [] }],
    responses: {
      200: {
        description: "The payout setup status.",
        content: {
          "application/json": {
            schema: setupSchema,
            example: { status: "COMPLETE", instantPayoutsAvailable: false },
          },
        },
      },
      ...sharedErrors,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/payouts/account",
    operationId: "startPayoutSetup",
    tags: ["Payouts"],
    summary: "UC1-07 Start or resume Stripe onboarding",
    description:
      "Creates a Stripe Connect Express account for the authenticated user, or reuses the pending one, and returns a single-use onboarding link. Stripe returns the user to /payouts. A COMPLETE setup is returned unchanged without an onboarding link; its destination cannot be replaced. Takes no request body. Requires a bearer token so another site cannot start setup with the user's cookies.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "The setup and, unless it is already complete, a fresh onboarding link.",
        content: {
          "application/json": {
            schema: setupSchema,
            example: {
              status: "PENDING",
              onboardingUrl: "https://connect.stripe.com/setup/e/acct_1Example/AbCdEf",
            },
          },
        },
      },
      ...sharedErrors,
    },
  });
}
