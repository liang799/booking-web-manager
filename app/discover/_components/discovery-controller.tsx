"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { DiscoveryFilters } from "../query";
import { discoveryHref } from "../navigation";
import { subscribeToDiscoveryChanges } from "../client-updates";
import { DiscoveryFormController } from "./discovery-form-controller";
import type { DiscoveryOutcome } from "./discovery-state";
import { startDiscoveryUpdates, type DiscoveryUpdates } from "./discovery-updates";

/** The URL owns committed filters and paging; React tracks only navigation and draft validation. */
export function DiscoveryController({ filters, outcome, queryKey, returnTo }: {
  readonly filters: DiscoveryFilters;
  readonly outcome: DiscoveryOutcome;
  readonly queryKey: string;
  readonly returnTo?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // React can batch transitions. Explicit user intent alone enables the loading UI.
  const [foreground, setForeground] = useState(false);
  const valid = outcome.status !== "invalid";
  const conditions = useRef({ valid, busy: false });
  const updates = useRef<DiscoveryUpdates | null>(null);

  useEffect(() => {
    if (!valid) return;
    const refreshes = startDiscoveryUpdates({
      refresh: () => startTransition(() => router.refresh()),
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
    // Results are ordered by start time. Remove expired cards even without a DB write.
    const startAt = outcome.status === "ready" ? outcome.page.items[0]?.startAt : undefined;
    updates.current?.expireAt(startAt === undefined ? undefined : Date.parse(startAt));
  }, [outcome, queryKey, valid]);

  function navigate(query?: string) {
    // Block background work immediately, before React commits the transition state.
    conditions.current.busy = true;
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
