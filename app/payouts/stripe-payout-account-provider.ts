import Stripe from "stripe";
import {
  PayoutProviderError,
  type OnboardingLinks,
  type PayoutAccountProvider,
  type ProviderAccountState,
} from "@/use-cases/payouts/SetUpPayoutAccount";

/**
 * UC1-07 through Stripe Connect Express. Stripe hosts identity verification
 * and the bank or card form; this adapter creates the connected account, links
 * to Stripe's onboarding, and reports what Stripe says about the account.
 */
export class StripePayoutAccountProvider implements PayoutAccountProvider {
  constructor(private readonly stripe: Stripe) {}

  async createAccount(request: {
    readonly userId: string;
    readonly email: string | null;
    readonly idempotencyKey: string;
  }): Promise<string> {
    const params: Stripe.AccountCreateParams = {
      type: "express",
      country: "SG",
      business_type: "individual",
      ...(request.email !== null ? { email: request.email } : {}),
      capabilities: { transfers: { requested: true } },
      metadata: { user_id: request.userId },
    };
    let idempotencyKey = request.idempotencyKey;
    for (let replays = 0; ; replays++) {
      try {
        const account = await this.stripe.accounts.create(params, { idempotencyKey });
        return account.id;
      } catch (cause) {
        // Stripe keeps a refusal under its key for 24 hours, even after the cause
        // (such as a Dashboard setting) is fixed. A replayed 4xx created no
        // account, so continue under a key derived from the original refused
        // request: concurrent requests derive the same key and stay deduplicated.
        const refused = replayedRefusal(cause);
        if (refused === undefined || replays >= MAX_REPLAYED_REFUSALS) throw providerFailure(cause);
        idempotencyKey = JSON.stringify([request.idempotencyKey, "after", refused]);
      }
    }
  }

  async createOnboardingLink(
    accountReference: string,
    links: OnboardingLinks,
  ): Promise<string> {
    if (accountReference.startsWith("acct_simulated_")) {
      throw new PayoutProviderError(
        "Simulated payout accounts cannot generate Stripe Connect onboarding links",
      );
    }
    const link = await provider(() =>
      this.stripe.accountLinks.create({
        account: accountReference,
        type: "account_onboarding",
        return_url: links.returnUrl,
        refresh_url: links.refreshUrl,
      }),
    );
    return link.url;
  }

  async getAccount(accountReference: string): Promise<ProviderAccountState> {
    // If transitioning from a simulated development account, reject safely so
    // the user can onboard a real Stripe Connect account without Stripe API errors.
    if (accountReference.startsWith("acct_simulated_")) {
      return {
        accountReference,
        payoutsEnabled: false,
        rejected: true,
        instantPayoutsAvailable: false,
      };
    }

    const account = await provider(() => this.stripe.accounts.retrieve(accountReference));
    return stripeAccountState(account);
  }
}

/**
 * Stripe's account object as the use case sees it. The default SGD destination
 * is preferred; a debit card that lists `instant` among its payout methods is
 * eligible for push-to-card payouts.
 */
export function stripeAccountState(account: Stripe.Account): ProviderAccountState {
  const destinations = account.external_accounts?.data ?? [];
  const destination =
    destinations.find((item) => item.default_for_currency === true && item.currency === "sgd") ??
    destinations.find((item) => item.default_for_currency === true) ??
    destinations[0];
  return {
    accountReference: account.id,
    payoutsEnabled: account.payouts_enabled === true,
    defaultDestinationReference: destination?.id,
    rejected: account.requirements?.disabled_reason?.startsWith("rejected.") === true,
    instantPayoutsAvailable:
      destination?.object === "card" &&
      (destination.available_payout_methods ?? []).includes("instant"),
  };
}

const MAX_REPLAYED_REFUSALS = 3;

/** The original request ID of a replayed client error, which created nothing. */
function replayedRefusal(cause: unknown): string | undefined {
  if (!(cause instanceof Stripe.errors.StripeError)) return undefined;
  const status = cause.statusCode ?? 0;
  // 409 is an in-flight conflict and 429 a rate limit; neither is a stored refusal.
  if (status < 400 || status >= 500 || status === 409 || status === 429) return undefined;
  if (cause.headers?.["idempotent-replayed"] !== "true") return undefined;
  return cause.headers["original-request"] || undefined;
}

async function provider<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (cause) {
    throw providerFailure(cause);
  }
}

function providerFailure(cause: unknown): unknown {
  if (!(cause instanceof Stripe.errors.StripeError)) return cause;
  // The response stays generic; the log keeps Stripe's reason for operators.
  console.error("Stripe payout account request failed", {
    type: cause.type, code: cause.code, statusCode: cause.statusCode,
    requestId: cause.requestId, replayed: cause.headers?.["idempotent-replayed"] === "true",
    message: cause.message,
  });
  return new PayoutProviderError("The payout provider could not complete the request", { cause });
}
