import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type Stripe from "stripe";
import {
  PayoutsUnavailableError,
  type PayoutDependencies,
} from "@/app/payouts/payout-dependencies";
import { createStripeClient, readStripeSettings, type StripeSettings } from "@/app/payouts/stripe-client";
import { StripePayoutAccountProvider } from "@/app/payouts/stripe-payout-account-provider";
import { StripePayoutTransfers } from "@/app/payouts/stripe-payout-transfers";
import {
  FakePayoutAccountProvider,
  FakePayoutTransfers,
} from "@/app/payouts/fake-payout-account-provider";
import { readSessionServerSettings } from "@/app/sessions/server-environment";
import { createPostgresPoolProvider } from "@/lib/database/postgres-pool";
import { PostgresPayoutSetupStore } from "@/lib/payouts/postgres-payout-setup-store";
import { PostgresPayoutUnitOfWork } from "@/lib/payouts/postgres-payout-unit-of-work";
import { PostgresSessionPayoutReader } from "@/lib/payouts/postgres-session-payout-reader";
import { createSupabaseSessionAuthenticator } from "@/lib/supabase/bearer-auth";
import { createSupabaseCookieSessionAuthenticator } from "@/lib/supabase/cookie-auth";
import { bearerOrLoginCookie } from "@/lib/supabase/request-authenticator";
import { ListSessionPayouts } from "@/use-cases/payouts/ListSessionPayouts";
import { SetUpPayoutAccount, type PayoutAccountProvider } from "@/use-cases/payouts/SetUpPayoutAccount";
import { WithdrawSessionPayout } from "@/use-cases/payouts/WithdrawSessionPayout";

export interface PayoutServices {
  readonly getPool: () => Pool;
  readonly stripe?: Stripe;
  readonly stripeSettings?: StripeSettings;
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly accounts: PayoutAccountProvider;
  readonly payoutSetup: SetUpPayoutAccount;
}

/**
 * Assembles the payout use cases on the session database and Stripe test
 * mode. When Stripe settings are not configured or SIMULATE_PAYOUTS=true,
 * uses FakePayoutAccountProvider to enable session creation and local testing.
 */
export function createPayoutServices(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): PayoutServices | undefined {
  const database = readSessionServerSettings(environment);
  if (database === undefined) return undefined;

  const simulate =
    environment.SIMULATE_PAYOUTS === "true" ||
    environment.NEXT_PUBLIC_SIMULATE_PAYOUTS === "true";
  const stripeSettings = readStripeSettings(environment);

  const getPool = createPostgresPoolProvider(database.databaseUrl);
  const clock = { now: () => new Date() };

  if (stripeSettings !== undefined && !simulate) {
    const stripe = createStripeClient(stripeSettings.secretKey);
    const accounts = new StripePayoutAccountProvider(stripe);
    return {
      getPool,
      stripe,
      stripeSettings,
      supabaseUrl: database.supabaseUrl,
      supabaseAnonKey: database.supabaseAnonKey,
      accounts,
      payoutSetup: new SetUpPayoutAccount({
        store: new PostgresPayoutSetupStore(getPool, clock),
        provider: accounts,
        ids: { next: randomUUID },
      }),
    };
  }

  // Fallback to fake payout adapter when Stripe is unconfigured or simulated
  const accounts = new FakePayoutAccountProvider();
  return {
    getPool,
    supabaseUrl: database.supabaseUrl,
    supabaseAnonKey: database.supabaseAnonKey,
    accounts,
    payoutSetup: new SetUpPayoutAccount({
      store: new PostgresPayoutSetupStore(getPool, clock),
      provider: accounts,
      ids: { next: randomUUID },
    }),
  };
}

/**
 * UC1-07 and UC1-08 routes. Reads accept login cookies; starting setup and
 * withdrawing need a bearer token, since cookie authentication accepts GET only.
 */
export function createPayoutDependencies(
  environment?: Readonly<Record<string, string | undefined>>,
): PayoutDependencies {
  const services = createPayoutServices(environment ?? process.env);
  if (services === undefined) {
    const unavailable = async (): Promise<never> => {
      throw new PayoutsUnavailableError();
    };
    return {
      authenticate: unavailable,
      payoutSetup: { status: unavailable, start: unavailable },
      sessionPayouts: { forBooker: unavailable },
      withdrawals: { forBooker: unavailable },
    };
  }
  const clock = { now: () => new Date() };
  const transfers = services.stripe
    ? new StripePayoutTransfers(services.stripe)
    : new FakePayoutTransfers();

  return {
    authenticate: bearerOrLoginCookie(
      createSupabaseSessionAuthenticator(services.supabaseUrl, services.supabaseAnonKey),
      createSupabaseCookieSessionAuthenticator(services.supabaseUrl, services.supabaseAnonKey),
    ),
    payoutSetup: services.payoutSetup,
    sessionPayouts: new ListSessionPayouts(new PostgresSessionPayoutReader(services.getPool)),
    withdrawals: new WithdrawSessionPayout({
      unitOfWork: new PostgresPayoutUnitOfWork(services.getPool, clock),
      transfers,
      accounts: services.accounts,
      clock,
      ids: { next: randomUUID },
    }),
  };
}
