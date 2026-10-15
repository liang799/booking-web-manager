import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { InfoNote } from "@/components/ui/info-note";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { PayoutSetup } from "../payout-transport";

export type PayoutScreenState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: PayoutSetup }
  | { readonly status: "error"; readonly message: string; readonly signIn: boolean };

export interface PayoutAccountViewProps {
  readonly state: PayoutScreenState;
  /** The user has just come back from Stripe's onboarding. */
  readonly returnedFromStripe: boolean;
  /** Waiting for a fresh onboarding link or the redirect to Stripe. */
  readonly starting: boolean;
  readonly startError: string | null;
  readonly onStart: () => void;
  readonly onRetry: () => void;
}

const copy = {
  NOT_STARTED: {
    title: "Set up payouts",
    body: "Connect a payout account to create sessions. When attendance is verified, players' shares are paid out to it.",
    action: "Set up with Stripe",
  },
  PENDING: {
    title: "Your payout setup isn't finished",
    body: "Stripe is still waiting for some details, or is checking what you sent. You can continue where you left off.",
    action: "Continue setup",
  },
  FAILED: {
    title: "Stripe couldn't verify your account",
    body: "This setup can't be used for payouts. You can start again with a new one.",
    action: "Start again",
  },
} as const;

/**
 * UC1-07 payout account screen. Display only: the page loads the setup and
 * starts onboarding. Stripe collects the identity, bank and card details;
 * this site never sees them.
 */
export function PayoutAccountView({
  state,
  returnedFromStripe,
  starting,
  startError,
  onStart,
  onRetry,
}: PayoutAccountViewProps) {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 pb-10 pt-6 md:px-8 md:pt-10">
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">
          <Link href="/wallet" className="underline-offset-4 hover:underline">Wallet</Link>
        </p>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Payout account</h1>
      </header>

      {state.status === "loading" && (
        <LoadingSpinner label={returnedFromStripe ? "Checking your setup with Stripe…" : "Loading your payout setup…"} />
      )}

      {state.status === "error" && (
        <div className="space-y-3">
          <ErrorMessage>{state.message}</ErrorMessage>
          {state.signIn
            ? <Button asChild className="min-h-11"><Link href="/login?next=%2Fpayouts">Log in</Link></Button>
            : <Button variant="outline" className="min-h-11" onClick={onRetry}>Try again</Button>}
        </div>
      )}

      {state.status === "ready" && state.data.status === "COMPLETE" && (
        <section className="space-y-4 rounded-lg border bg-card p-4 md:p-6">
          <h2 className="text-lg font-semibold">Payouts are set up</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            You can create sessions. When attendance is verified, each session&apos;s share is paid out to the account you connected in Stripe.
          </p>
          {state.data.instantPayoutsAvailable === true && (
            <InfoNote icon>Your debit card supports instant payouts.</InfoNote>
          )}
          {state.data.instantPayoutsAvailable === false && (
            <InfoNote icon>Payouts go to your bank by standard transfer, usually within a few business days.</InfoNote>
          )}
          <Button asChild className="min-h-11"><Link href="/sessions/create">Create a session</Link></Button>
        </section>
      )}

      {state.status === "ready" && state.data.status !== "COMPLETE" && (
        <section className="space-y-4 rounded-lg border bg-card p-4 md:p-6">
          <h2 className="text-lg font-semibold">{copy[state.data.status].title}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{copy[state.data.status].body}</p>
          {returnedFromStripe && state.data.status === "PENDING" && (
            <InfoNote icon>Stripe may take a few minutes to review your details. This page shows the result once they&apos;re done.</InfoNote>
          )}
          {startError && <ErrorMessage>{startError}</ErrorMessage>}
          <Button className="min-h-11" disabled={starting} onClick={onStart}>
            {starting ? "Opening Stripe…" : copy[state.data.status].action}
          </Button>
          <p className="text-xs text-muted-foreground">
            Stripe verifies your identity and collects your bank account or debit card. This site never sees those details.
          </p>
        </section>
      )}
    </div>
  );
}
