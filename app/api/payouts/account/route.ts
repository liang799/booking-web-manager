import { onboardingLinksFor, payoutAction } from "@/app/payouts/payout-action";
import { getPayoutDependencies } from "@/app/payouts/payout-server-dependencies";

export const runtime = "nodejs";

/** UC1-07: the signed-in user's payout setup, refreshed from Stripe while pending. */
export const GET = payoutAction(getPayoutDependencies, (dependencies, userId) =>
  dependencies.payoutSetup.status(userId),
);

/** UC1-07: start or resume Stripe onboarding and return a fresh onboarding link. */
export const POST = payoutAction(getPayoutDependencies, (dependencies, userId, request) =>
  dependencies.payoutSetup.start(userId, onboardingLinksFor(request)),
);
