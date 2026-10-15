"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { PayoutAccountView, type PayoutScreenState } from "./_components/payout-account-view";
import { payoutTransport, type PayoutLoad, type PayoutTransport } from "./payout-transport";

function toState(result: PayoutLoad): PayoutScreenState {
  return result.status === "ready"
    ? result
    : { status: "error", message: result.message, signIn: result.code === "UNAUTHENTICATED" };
}

/**
 * UC1-07 controller. Stripe returns users here with `?onboarding=return`, or
 * `?onboarding=refresh` when the onboarding link expired, in which case a
 * fresh link is requested and the user is sent straight back.
 */
function PayoutPage({ transport }: { readonly transport: PayoutTransport }) {
  const onboarding = useSearchParams().get("onboarding");
  const [state, setState] = useState<PayoutScreenState>({ status: "loading" });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    setState(toState(await transport.load()));
  }, [transport]);

  const start = useCallback(async () => {
    setStarting(true);
    setStartError(null);
    const result = await transport.start();
    if (result.status === "ready" && result.data.onboardingUrl) {
      window.location.assign(result.data.onboardingUrl);
      return;
    }
    setStarting(false);
    if (result.status === "ready") {
      setState(result);
      return;
    }
    // Arriving from an expired Stripe link, nothing has loaded yet: show the failure in place of it.
    setState((current) => (current.status === "ready" ? current : toState(result)));
    setStartError(result.message);
  }, [transport]);

  useEffect(() => {
    if (onboarding === "refresh") void start();
    else void load();
  }, [onboarding, load, start]);

  return (
    <PayoutAccountView
      state={state}
      returnedFromStripe={onboarding === "return"}
      starting={starting}
      startError={startError}
      onStart={() => void start()}
      onRetry={() => void load()}
    />
  );
}

export default function Page() {
  return (
    <Suspense>
      <PayoutPage transport={payoutTransport} />
    </Suspense>
  );
}
