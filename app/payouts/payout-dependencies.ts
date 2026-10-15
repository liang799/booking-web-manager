import type { UUID } from "@/domain";
import type { ListSessionPayouts } from "@/use-cases/payouts/ListSessionPayouts";
import type { SetUpPayoutAccount } from "@/use-cases/payouts/SetUpPayoutAccount";
import type { WithdrawSessionPayout } from "@/use-cases/payouts/WithdrawSessionPayout";

export const PAYOUTS_UNAVAILABLE_MESSAGE = "Payouts are not available yet";

/** Server configuration (database or Stripe test keys) is missing. */
export class PayoutsUnavailableError extends Error {
  constructor(message: string = PAYOUTS_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "PayoutsUnavailableError";
  }
}

/** App-owned capabilities for the UC1-07 and UC1-08 payout routes. */
export interface PayoutDependencies {
  readonly authenticate: (request: Request) => Promise<UUID | null>;
  readonly payoutSetup: Pick<SetUpPayoutAccount, "status" | "start">;
  readonly sessionPayouts: Pick<ListSessionPayouts, "forBooker">;
  readonly withdrawals: Pick<WithdrawSessionPayout, "forBooker">;
}
