import { parsePushEndpoint, parsePushSubscription } from "@/app/commit/push-subscription-input";
import { pushSubscriptionErrorResponse } from "@/app/commit/push-subscription-response";
import { getPushSubscriptionDependencies } from "@/app/commit/push-subscription-server-dependencies";
import { createAuthenticatedActions } from "@/app/http/authenticated-action";

export const runtime = "nodejs";

const actions = createAuthenticatedActions({
  getDependencies: getPushSubscriptionDependencies,
  errorResponse: pushSubscriptionErrorResponse,
});

/** Registers this browser to receive the signed-in user's commitment notifications. */
export const POST = actions.json({
  parse: (userId, body) => ({ userId, subscription: parsePushSubscription(body) }),
  run: (dependencies, { userId, subscription }) => dependencies.subscriptions.register(userId, subscription),
  invalidRequestMessage: "Invalid push subscription",
  successStatus: 204,
});

/** Stops sending to this browser; only the signed-in user's own subscription is removed. */
export const DELETE = actions.json({
  parse: (userId, body) => ({ userId, endpoint: parsePushEndpoint(body) }),
  run: (dependencies, { userId, endpoint }) => dependencies.subscriptions.unregister(userId, endpoint),
  invalidRequestMessage: "Invalid push subscription",
  successStatus: 204,
});
