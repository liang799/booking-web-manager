import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { errorResponse, z } from "@/app/openapi/contracts";
import { PAYOUTS_UNAVAILABLE_MESSAGE } from "./payout-dependencies";
import { withdrawRequestSchema } from "./withdraw-input";

const sessionPayoutsSchema = z.object({
  items: z.array(
    z.object({
      sessionId: z.string().uuid(),
      venueName: z.string(),
      sport: z.string(),
      startAt: z.string().datetime(),
      status: z.enum(["AWAITING_PAYOUT", "PAYOUT_PENDING", "SETTLED"]),
      amountCents: z.number().int().nonnegative(),
    }),
  ),
});

const withdrawalResultSchema = z.object({
  kind: z.enum(["PAID", "NOTHING_TO_PAY", "DECLINED"]),
  payoutId: z.string().uuid().optional(),
  amountCents: z.number().int().positive().optional(),
  bankPayout: z.enum(["STANDARD", "INSTANT"]).optional(),
  reason: z.string().optional(),
});

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
  const payoutsSchema = registry.register("SessionPayouts", sessionPayoutsSchema);
  const withdrawRequest = registry.register("WithdrawSessionPayoutRequest", withdrawRequestSchema);
  const withdrawalResult = registry.register("WithdrawSessionPayoutResult", withdrawalResultSchema);

  registry.registerPath({
    method: "get",
    path: "/api/payouts/sessions",
    operationId: "listSessionPayouts",
    tags: ["Payouts"],
    summary: "UC1-08 List sessions the booker can withdraw",
    description:
      "Returns the authenticated booker's sessions from attendance verification onwards: AWAITING_PAYOUT (ready to withdraw; the amount is an estimate from the unsettled holds), PAYOUT_PENDING (a withdrawal is in progress; its frozen amount) and SETTLED (paid; the completed payout). Amounts are integer SGD cents.",
    security: [{ bearerAuth: [] }, { loginCookie: [] }],
    responses: {
      200: {
        description: "The booker's payable and paid sessions.",
        content: {
          "application/json": {
            schema: payoutsSchema,
            example: {
              items: [
                {
                  sessionId: "44444444-4444-4444-8444-444444444444",
                  venueName: "Kallang Tennis Hub",
                  sport: "Tennis",
                  startAt: "2026-10-10T10:00:00.000Z",
                  status: "AWAITING_PAYOUT",
                  amountCents: 1000,
                },
              ],
            },
          },
        },
      },
      ...sharedErrors,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/payouts/withdraw",
    operationId: "withdrawSessionPayout",
    tags: ["Payouts"],
    summary: "UC1-08 Withdraw a session's payout",
    description:
      "Pays a verified session's released and forfeited shares to the booker's payout account: a Stripe transfer to their connected account, then an instant payout to an eligible debit card when INSTANT is requested, otherwise Stripe's standard schedule. The server computes the amount; the body carries no money. DECLINED means Stripe refused and no money moved; the session can be withdrawn again with a new key. After a 502 or a lost response, retry with the same idempotencyKey: an attempt in progress is resumed and never paid twice. Requires a bearer token.",
    security: [{ bearerAuth: [] }],
    request: {
      body: { required: true, content: { "application/json": { schema: withdrawRequest } } },
    },
    responses: {
      200: {
        description: "The withdrawal outcome.",
        content: {
          "application/json": {
            schema: withdrawalResult,
            example: {
              kind: "PAID",
              payoutId: "55555555-5555-4555-8555-555555555555",
              amountCents: 1000,
              bankPayout: "STANDARD",
            },
          },
        },
      },
      400: errorResponse("The body is not valid JSON or fails validation.", "INVALID_REQUEST", "Invalid withdrawal request"),
      409: errorResponse(
        "The session cannot be paid out now: attendance is incomplete, it is not the booker's to settle yet, the payout account is not set up, or the key was reused for a different request.",
        "ATTENDANCE_INCOMPLETE",
        "All committed participants must be finalized before settlement",
      ),
      ...sharedErrors,
    },
  });

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
