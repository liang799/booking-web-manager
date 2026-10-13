import type {
  PayoutAccountProvider,
  SetUpPayoutAccount,
} from "@/use-cases/payouts/SetUpPayoutAccount";
import type { StripeEventHandler } from "./stripe-webhook";

/**
 * UC1-07 `account.updated`: Stripe reports a change to a connected account,
 * such as onboarding finishing or verification failing. The account is read
 * fresh from Stripe rather than trusted from the event body, so out-of-order
 * deliveries apply the current state.
 */
export function accountUpdatedHandler(
  accounts: Pick<PayoutAccountProvider, "getAccount">,
  payoutSetup: Pick<SetUpPayoutAccount, "applyProviderUpdate">,
): StripeEventHandler {
  return async (event) => {
    if (event.type !== "account.updated") return;
    const accountReference = event.account ?? event.data.object.id;
    const state = await accounts.getAccount(accountReference);
    const outcome = await payoutSetup.applyProviderUpdate(
      { eventId: event.id, eventType: event.type },
      state,
    );
    // An account this system never recorded is acknowledged, not retried forever.
    if (outcome === "UNKNOWN_ACCOUNT")
      console.warn("Stripe account.updated for an unrecorded account", accountReference);
  };
}
