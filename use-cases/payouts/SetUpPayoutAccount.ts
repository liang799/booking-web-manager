import { DomainError, type User, type UUID } from "@/domain";

export type PayoutSetupStatus = "NOT_STARTED" | "PENDING" | "COMPLETE" | "FAILED";

/** The payout provider's current view of one connected account. */
export interface ProviderAccountState {
  readonly accountReference: string;
  /** The provider will pay out to the account's default destination. */
  readonly payoutsEnabled: boolean;
  /** The bank account or debit card payouts go to, once one is attached. */
  readonly defaultDestinationReference?: string;
  /** The provider closed the account permanently, such as after failed verification. */
  readonly rejected: boolean;
  /** The default destination is a debit card eligible for instant (push-to-card) payouts. */
  readonly instantPayoutsAvailable: boolean;
}

export interface OnboardingLinks {
  /** Where the provider sends the user after onboarding. */
  readonly returnUrl: string;
  /** Where the provider sends the user when the link has expired or was already used. */
  readonly refreshUrl: string;
}

/**
 * The payout provider (Stripe Connect Express). Every call happens outside a
 * database transaction (CLAUDE.md rule #4).
 */
export interface PayoutAccountProvider {
  createAccount(request: {
    readonly userId: UUID;
    readonly email: string | null;
    readonly idempotencyKey: string;
  }): Promise<string>;
  createOnboardingLink(accountReference: string, links: OnboardingLinks): Promise<string>;
  getAccount(accountReference: string): Promise<ProviderAccountState>;
}

/** The provider rejected or failed a request. Adapters wrap provider errors in this. */
export class PayoutProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PayoutProviderError";
  }
}

/** One provider notification, applied at most once. */
export interface ProviderEvent {
  readonly eventId: string;
  readonly eventType: string;
}

export type ProviderEventOutcome<T> =
  | { readonly kind: "APPLIED"; readonly result: T }
  | { readonly kind: "DUPLICATE" }
  | { readonly kind: "UNKNOWN_ACCOUNT" };

/** Loads and saves payout setup through the User aggregate root (ADR-0003). */
export interface PayoutSetupStore {
  /** Runs `work` on the complete, locked User in one transaction, then saves its payout setup. */
  forUser<T>(userId: UUID, work: (user: User) => T): Promise<T>;
  /**
   * Runs `work` on the User whose payout setup uses `accountReference`, recording
   * `event` in the same transaction. A recorded event returns DUPLICATE without
   * running `work`. An unknown reference records nothing, so a later delivery of
   * the same event can still apply once the setup is saved.
   */
  forProviderAccount<T>(
    accountReference: string,
    event: ProviderEvent,
    work: (user: User) => T,
  ): Promise<ProviderEventOutcome<T>>;
}

export interface PayoutSetupView {
  readonly status: PayoutSetupStatus;
  /** A fresh provider onboarding link, returned when setup was started or resumed. */
  readonly onboardingUrl?: string;
  /** Known once setup is complete and the provider could be reached. */
  readonly instantPayoutsAvailable?: boolean;
}

export interface SetUpPayoutAccountDependencies {
  readonly store: PayoutSetupStore;
  readonly provider: PayoutAccountProvider;
  readonly ids: { next(): UUID };
}

/**
 * UC1-07 Set Up Payout Account. A booker needs a completed payout account
 * before creating a session, because settled shares are paid out to it.
 *
 * The provider owns identity verification and the bank or card details; this
 * system records only the provider's account reference and the destination
 * reference it reports. Setup completes when the provider says payouts are
 * enabled, whether the news arrives by webhook or by the status refresh below.
 */
export class SetUpPayoutAccount {
  constructor(private readonly dependencies: SetUpPayoutAccountDependencies) {}

  /**
   * Reports the user's payout setup. A pending setup is refreshed from the
   * provider, so a missed or misconfigured webhook cannot leave it stuck.
   */
  async status(userId: UUID): Promise<PayoutSetupView> {
    const current = await this.dependencies.store.forUser(userId, readSetup);
    if (current.status === "NOT_STARTED" || current.status === "FAILED")
      return { status: current.status };

    let account: ProviderAccountState;
    try {
      account = await this.dependencies.provider.getAccount(current.accountReference);
    } catch (error) {
      // The stored status is still true; only the refresh was unavailable.
      if (error instanceof PayoutProviderError) return { status: current.status };
      throw error;
    }

    const status =
      current.status === "PENDING"
        ? await this.dependencies.store.forUser(userId, (user) =>
            applyAccountState(user, account),
          )
        : current.status;
    return status === "COMPLETE"
      ? { status, instantPayoutsAvailable: account.instantPayoutsAvailable }
      : { status };
  }

  /**
   * Starts or resumes onboarding and returns a fresh link to the provider's
   * hosted flow. A completed setup is returned unchanged; its destination
   * cannot be replaced.
   */
  async start(userId: UUID, links: OnboardingLinks): Promise<PayoutSetupView> {
    const current = await this.dependencies.store.forUser(userId, (user) => {
      DomainError.require(
        user.accountStatus === "ACTIVE",
        "INACTIVE_ACCOUNT",
        "An inactive account cannot set up payouts",
      );
      return readSetup(user);
    });
    if (current.status === "COMPLETE") return { status: "COMPLETE" };

    let accountReference: string | undefined =
      current.status === "PENDING" ? current.accountReference : undefined;
    if (accountReference === undefined) {
      // Created outside the transaction (rule #4). The key keeps a double-click
      // from creating two provider accounts; a retry after FAILED gets a new one.
      const created = await this.dependencies.provider.createAccount({
        userId,
        email: current.email,
        idempotencyKey: JSON.stringify([
          "UC1-07",
          userId,
          current.status === "FAILED" ? current.accountReference : "first",
        ]),
      });
      accountReference = await this.dependencies.store.forUser(userId, (user) => {
        const existing = user.payoutAccount;
        // Another request began or finished setup while this one was creating
        // the provider account; continue with the recorded one.
        if (existing?.setupStatus === "PENDING") return existing.providerAccountReference;
        if (existing?.setupStatus === "COMPLETE") return undefined;
        user.beginPayoutSetup({
          payoutAccountId: this.dependencies.ids.next(),
          providerAccountReference: created,
        });
        return created;
      });
      if (accountReference === undefined) return { status: "COMPLETE" };
    }

    const onboardingUrl = await this.dependencies.provider.createOnboardingLink(
      accountReference,
      links,
    );
    return { status: "PENDING", onboardingUrl };
  }

  /**
   * Applies a provider notification about a connected account, at most once
   * per event. The caller fetches `account` fresh from the provider rather than
   * trusting the notification body.
   */
  async applyProviderUpdate(
    event: ProviderEvent,
    account: ProviderAccountState,
  ): Promise<PayoutSetupStatus | "DUPLICATE" | "UNKNOWN_ACCOUNT"> {
    const outcome = await this.dependencies.store.forProviderAccount(
      account.accountReference,
      event,
      (user) => applyAccountState(user, account),
    );
    return outcome.kind === "APPLIED" ? outcome.result : outcome.kind;
  }
}

type StoredSetup =
  | { readonly status: "NOT_STARTED"; readonly email: string | null }
  | {
      readonly status: "PENDING" | "COMPLETE" | "FAILED";
      readonly accountReference: string;
      readonly email: string | null;
    };

function readSetup(user: User): StoredSetup {
  const email = user.email?.toString() ?? null;
  const account = user.payoutAccount;
  if (account === undefined) return { status: "NOT_STARTED", email };
  return {
    status: account.setupStatus,
    accountReference: account.providerAccountReference,
    email,
  };
}

/**
 * Moves a pending setup to its provider-reported outcome through the User
 * root. A completed destination is never replaced, a failed setup stays
 * failed until the user starts a new one, and an inactive account keeps
 * whatever was recorded.
 */
function applyAccountState(user: User, account: ProviderAccountState): PayoutSetupStatus {
  const setup = user.payoutAccount;
  if (setup === undefined || setup.providerAccountReference !== account.accountReference)
    return setup?.setupStatus ?? "NOT_STARTED";
  if (user.accountStatus !== "ACTIVE" || setup.setupStatus !== "PENDING")
    return setup.setupStatus;
  if (account.rejected) {
    user.failPayoutSetup();
    return "FAILED";
  }
  if (account.payoutsEnabled && account.defaultDestinationReference !== undefined) {
    user.completePayoutSetup(account.defaultDestinationReference);
    return "COMPLETE";
  }
  return "PENDING";
}
