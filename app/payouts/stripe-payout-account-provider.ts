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
    const account = await provider(() =>
      this.stripe.accounts.create(
        {
          type: "express",
          country: "SG",
          business_type: "individual",
          ...(request.email !== null ? { email: request.email } : {}),
          capabilities: { transfers: { requested: true } },
          metadata: { user_id: request.userId },
        },
        { idempotencyKey: request.idempotencyKey },
      ),
    );
    return account.id;
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

async function provider<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (cause) {
    if (cause instanceof Stripe.errors.StripeError) {
      // The response stays generic; the log keeps Stripe's reason for operators.
      console.error("Stripe payout account request failed", {
        type: cause.type, code: cause.code, statusCode: cause.statusCode,
        requestId: cause.requestId, message: cause.message,
      });
      throw new PayoutProviderError("The payout provider could not complete the request", { cause });
    }
    throw cause;
  }
}
