import Stripe from "stripe";

export type StripeEventHandler = (event: Stripe.Event) => Promise<void>;

export interface StripeWebhookDependencies {
  /** The verified event, or null when no configured secret signed this payload. */
  readonly verify: (payload: string, signature: string) => Stripe.Event | null;
  readonly handlers: Readonly<Partial<Record<Stripe.Event["type"], StripeEventHandler>>>;
}

/**
 * Verifies a webhook against each signing secret in turn: the platform
 * endpoint and the connected-account endpoint have different secrets, while
 * `stripe listen` uses one secret for both.
 */
export function createStripeEventVerifier(
  stripe: Stripe,
  secrets: readonly string[],
): StripeWebhookDependencies["verify"] {
  return (payload, signature) => {
    for (const secret of secrets) {
      try {
        return stripe.webhooks.constructEvent(payload, signature, secret);
      } catch (error) {
        if (error instanceof Stripe.errors.StripeSignatureVerificationError) continue;
        throw error;
      }
    }
    return null;
  };
}

/**
 * The Stripe webhook boundary (CLAUDE.md rule #2). Only a correctly signed
 * payload reaches a handler; the raw body is verified before it is parsed.
 * Handlers apply each event at most once against `processed_events`, so a
 * failure answers 500 and Stripe's retry is safe. Event types without a
 * handler are acknowledged and ignored.
 */
export async function handleStripeWebhook(
  request: Request,
  dependencies: StripeWebhookDependencies | undefined,
): Promise<Response> {
  if (dependencies === undefined)
    return failure(503, "WEBHOOKS_UNAVAILABLE", "Stripe webhooks are not configured");

  const signature = request.headers.get("stripe-signature");
  if (!signature) return failure(400, "MISSING_SIGNATURE", "Stripe-Signature header is required");

  const event = dependencies.verify(await request.text(), signature);
  if (event === null) return failure(400, "INVALID_SIGNATURE", "Webhook signature verification failed");

  const handler = dependencies.handlers[event.type];
  if (handler !== undefined) {
    try {
      await handler(event);
    } catch (error) {
      console.error("Stripe webhook handling failed", event.type, event.id, error);
      return failure(500, "WEBHOOK_FAILED", "The event could not be processed");
    }
  }
  return Response.json({ received: true }, { headers: { "Cache-Control": "no-store" } });
}

function failure(status: number, code: string, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
