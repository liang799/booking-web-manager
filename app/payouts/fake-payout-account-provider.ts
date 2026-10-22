import type {
  OnboardingLinks,
  PayoutAccountProvider,
  ProviderAccountState,
} from "@/use-cases/payouts/SetUpPayoutAccount";
import type { PayoutTransfers } from "@/use-cases/payouts/WithdrawSessionPayout";

export interface FakePayoutAccountOptions {
  /** If true (default), getAccount returns payoutsEnabled: true so onboarding completes immediately. */
  readonly completeImmediately?: boolean;
  /** Custom destination reference for the bank or card. Default: 'ba_simulated_destination'. */
  readonly defaultDestinationReference?: string;
  /** Whether instant payouts should be reported as available. Default: true. */
  readonly instantPayoutsAvailable?: boolean;
}

/**
 * A simulated in-memory adapter implementing PayoutAccountProvider.
 *
 * Used in local development, test environments, or when Stripe Connect is not
 * configured. This unlocks session creation (UC2-02), discovery (UC2-01), and
 * participant flows without requiring live or test Stripe Connect platform credentials.
 */
export class FakePayoutAccountProvider implements PayoutAccountProvider {
  readonly createdAccounts: {
    readonly userId: string;
    readonly email: string | null;
    readonly idempotencyKey: string;
  }[] = [];
  readonly linkRequests: {
    readonly accountReference: string;
    readonly links: OnboardingLinks;
  }[] = [];

  private readonly accounts = new Map<string, ProviderAccountState>();
  private readonly completeImmediately: boolean;
  private readonly defaultDestinationReference: string;
  private readonly instantPayoutsAvailable: boolean;

  constructor(options: FakePayoutAccountOptions = {}) {
    this.completeImmediately = options.completeImmediately ?? true;
    this.defaultDestinationReference =
      options.defaultDestinationReference ?? "ba_simulated_destination";
    this.instantPayoutsAvailable = options.instantPayoutsAvailable ?? true;
  }

  async createAccount(request: {
    readonly userId: string;
    readonly email: string | null;
    readonly idempotencyKey: string;
  }): Promise<string> {
    this.createdAccounts.push({ ...request });
    const cleanId = request.userId.replace(/-/g, "").slice(0, 12);
    const accountReference = `acct_simulated_${cleanId}`;

    const state: ProviderAccountState = {
      accountReference,
      payoutsEnabled: this.completeImmediately,
      defaultDestinationReference: this.defaultDestinationReference,
      rejected: false,
      instantPayoutsAvailable: this.instantPayoutsAvailable,
    };
    this.accounts.set(accountReference, state);
    return accountReference;
  }

  async createOnboardingLink(
    accountReference: string,
    links: OnboardingLinks,
  ): Promise<string> {
    this.linkRequests.push({ accountReference, links });
    const separator = links.returnUrl.includes("?") ? "&" : "?";
    // Redirect immediately back to the return URL with onboarding=return to trigger status completion
    return `${links.returnUrl}${separator}onboarding=return&simulated=true`;
  }

  async getAccount(accountReference: string): Promise<ProviderAccountState> {
    const existing = this.accounts.get(accountReference);
    if (existing) return existing;

    // Resilient fallback: returns a completed provider state for any simulated account reference
    return {
      accountReference,
      payoutsEnabled: this.completeImmediately,
      defaultDestinationReference: this.defaultDestinationReference,
      rejected: false,
      instantPayoutsAvailable: this.instantPayoutsAvailable,
    };
  }
}

/**
 * A simulated adapter implementing PayoutTransfers for UC1-08 withdrawal workflows.
 */
export class FakePayoutTransfers implements PayoutTransfers {
  readonly transfers: {
    readonly payoutId: string;
    readonly sessionId: string;
    readonly amountCents: number;
    readonly accountReference: string;
  }[] = [];
  readonly instantPayouts: {
    readonly payoutId: string;
    readonly amountCents: number;
    readonly accountReference: string;
  }[] = [];

  async transfer(request: {
    readonly payoutId: string;
    readonly sessionId: string;
    readonly amountCents: number;
    readonly accountReference: string;
  }): Promise<string> {
    this.transfers.push({ ...request });
    const cleanId = request.payoutId.replace(/-/g, "").slice(0, 12);
    return `tr_simulated_${cleanId}`;
  }

  async instantPayout(request: {
    readonly payoutId: string;
    readonly amountCents: number;
    readonly accountReference: string;
  }): Promise<void> {
    this.instantPayouts.push({ ...request });
  }
}
