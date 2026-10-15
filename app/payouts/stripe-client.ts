import Stripe from "stripe";

/** Pinned so a Stripe account default cannot change payload shapes underneath the handlers. */
export const STRIPE_API_VERSION = "2025-02-24.acacia";

export interface StripeSettings {
  readonly secretKey: string;
  /** Signing secrets for platform and connected-account webhook endpoints. */
  readonly webhookSecrets: readonly string[];
}

/**
 * Reads the server-only Stripe settings. Missing or placeholder keys leave
 * payments unavailable. A live-mode key is refused outright: live payouts need
 * an ACRA-registered entity, so everything runs in test mode (CLAUDE.md, Out of
 * scope).
 */
export function readStripeSettings(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): StripeSettings | undefined {
  const secretKey = environment.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return undefined;
  if (/^(sk|rk)_live_/.test(secretKey))
    throw new Error("STRIPE_SECRET_KEY is a live-mode key; only test-mode keys are allowed");
  if (!/^(sk|rk)_test_/.test(secretKey)) return undefined;
  const webhookSecrets = [
    environment.STRIPE_WEBHOOK_SECRET,
    environment.STRIPE_CONNECT_WEBHOOK_SECRET,
  ]
    .map((secret) => secret?.trim() ?? "")
    .filter((secret) => secret !== "");
  return { secretKey, webhookSecrets };
}

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    timeout: 10_000,
  });
}
