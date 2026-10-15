import { loadDependencies } from "@/app/http/load-dependencies";
import { handleStripeWebhook } from "../stripe-webhook";
import { getStripeWebhookDependencies } from "../stripe-webhook-server-dependencies";

export const runtime = "nodejs";

/** Stripe webhook endpoint. Local development: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`. */
export async function POST(request: Request): Promise<Response> {
  let dependencies;
  try {
    dependencies = await loadDependencies(getStripeWebhookDependencies);
  } catch {
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  return handleStripeWebhook(request, dependencies);
}
