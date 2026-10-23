"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { DiscoveryFilters } from "../query";
import { discoveryHref } from "../navigation";
import { subscribeToDiscoveryChanges } from "../client-updates";
import { DiscoveryFormController } from "./discovery-form-controller";
import type { DiscoveryOutcome } from "./discovery-state";
import { startDiscoveryUpdates, type DiscoveryUpdates, type DiscoveryExpiry } from "./discovery-updates";

/** The URL owns committed filters and paging; React tracks only navigation and draft validation. */
export function DiscoveryController({ filters, outcome, queryKey, returnTo, expiry }: {
  readonly filters: DiscoveryFilters;
  readonly outcome: DiscoveryOutcome;
  readonly queryKey: string;
  readonly expiry: DiscoveryExpiry | null;
  readonly returnTo?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // React can batch transitions. Explicit user intent alone enables the loading UI.
  const [foreground, setForeground] = useState(false);
  const valid = outcome.status !== "invalid";
  const conditions = useRef({ valid, busy: false });
  const updates = useRef<DiscoveryUpdates | null>(null);
  const readStartedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!valid) return;
    const refreshes = startDiscoveryUpdates({
      refresh: () => {
        readStartedAt.current = performance.now();
        startTransition(() => router.refresh());
      },
      canRefresh: () => conditions.current.valid && !conditions.current.busy,
      subscribe: subscribeToDiscoveryChanges,
      document, window, online: () => navigator.onLine,
    });
    updates.current = refreshes;
    return () => { refreshes.stop(); updates.current = null; };
  }, [router, queryKey, valid]);

  useEffect(() => {
    conditions.current = { valid, busy: pending || foreground };
    if (!pending) {
      updates.current?.complete();
      setForeground(false);
    }
  }, [valid, pending, foreground]);

  useEffect(() => {
    const elapsed = readStartedAt.current === null ? 0 : performance.now() - readStartedAt.current;
    updates.current?.expireAt(expiry, elapsed);
    readStartedAt.current = null;
  }, [expiry, outcome, queryKey, valid]);

  function navigate(query?: string) {
    // Block background work immediately, before React commits the transition state.
    conditions.current.busy = true;
    readStartedAt.current = performance.now();
    setForeground(true);
    startTransition(() => {
      if (query === undefined || query === queryKey) router.refresh();
      else router.push(discoveryHref(query, returnTo));
    });
  }

  return (
    <DiscoveryFormController
      key={queryKey}
      filters={filters}
      outcome={outcome}
      pending={pending && foreground}
      returnTo={returnTo}
      onNavigate={navigate}
      onRefresh={() => navigate()}
    />
  );
}
