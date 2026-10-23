"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { DiscoveryFilters } from "../query";
import { discoveryHref } from "../navigation";
import { subscribeToDiscoveryChanges } from "../client-updates";
import { readDiscovery } from "../client-read";
import { DiscoveryFormController } from "./discovery-form-controller";
import type { DiscoveryOutcome } from "./discovery-state";
import { startDiscoveryUpdates, type DiscoveryUpdates, type DiscoveryExpiry } from "./discovery-updates";

/** The URL owns the query; server reads replace results without remounting form drafts. */
export function DiscoveryController({ filters, outcome, queryKey, returnTo, expiry }: {
  readonly filters: DiscoveryFilters;
  readonly outcome: DiscoveryOutcome;
  readonly queryKey: string;
  readonly expiry: DiscoveryExpiry | null;
  readonly returnTo?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [foreground, setForeground] = useState(false);
  const [displayedOutcome, setDisplayedOutcome] = useState(outcome);
  const valid = outcome.status !== "invalid";
  const updates = useRef<DiscoveryUpdates | null>(null);
  const activeRead = useRef<AbortController | null>(null);
  const navigating = useRef(false);

  const cancelRead = useCallback(() => {
    const request = activeRead.current;
    activeRead.current = null;
    request?.abort();
  }, []);

  const refresh = useCallback((showLoading = false) => {
    cancelRead();
    const request = new AbortController();
    activeRead.current = request;
    const startedAt = performance.now();
    setForeground(showLoading);
    void (async () => {
      try {
        const result = await readDiscovery(queryKey, request.signal);
        if (activeRead.current !== request || result === null) return;
        setDisplayedOutcome(result.outcome);
        updates.current?.expireAt(result.expiry, performance.now() - startedAt);
      } finally {
        if (activeRead.current === request) {
          activeRead.current = null;
          setForeground(false);
          updates.current?.complete();
        }
      }
    })();
  }, [cancelRead, queryKey]);

  useEffect(() => {
    if (!valid) return;
    const refreshes = startDiscoveryUpdates({
      refresh,
      canRefresh: () => !navigating.current && activeRead.current === null,
      subscribe: subscribeToDiscoveryChanges,
      document, window, online: () => navigator.onLine,
    });
    updates.current = refreshes;
    return () => { refreshes.stop(); updates.current = null; cancelRead(); };
  }, [cancelRead, refresh, valid]);

  useEffect(() => {
    if (!pending) {
      navigating.current = false;
      updates.current?.complete();
    }
  }, [pending]);

  useEffect(() => {
    // A new server navigation result supersedes an older API read for this query.
    cancelRead();
    setDisplayedOutcome(outcome);
    setForeground(false);
    updates.current?.expireAt(expiry);
    updates.current?.complete();
  }, [cancelRead, expiry, outcome]);

  function navigate(query?: string) {
    if (query === undefined || query === queryKey) { refresh(true); return; }
    // Block background work immediately, before React commits the navigation.
    navigating.current = true;
    cancelRead();
    setForeground(false);
    startTransition(() => router.push(discoveryHref(query, returnTo)));
  }

  return (
    <DiscoveryFormController
      key={queryKey}
      filters={filters}
      outcome={displayedOutcome}
      pending={pending || foreground}
      returnTo={returnTo}
      onNavigate={navigate}
      onRefresh={() => navigate()}
    />
  );
}
