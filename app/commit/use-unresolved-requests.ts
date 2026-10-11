"use client";

import { useEffect, useState } from "react";
import { settleAttempt, type AttemptOutcome, type UnresolvedStore } from "./withdrawal-recovery";

/** Settles one attempt with what it established. */
export type SettleAttempt = (outcome: AttemptOutcome) => void;

export interface UnresolvedRequests<T> {
  /** The signed-in user's unresolved requests by session, after reconciling with the server's list. */
  readonly unresolved: ReadonlyMap<string, T>;
  /**
   * Call just before sending. A first attempt is saved before the request leaves, so a reload
   * while it is in flight still retries it with the same key. Returns the function that settles
   * this attempt, bound to this user even if another account signs in meanwhile.
   */
  readonly begin: (sessionId: string, entry: T, wasRetry: boolean) => SettleAttempt;
}

/**
 * Keeps one user's unresolved requests, following `withdrawal-recovery.ts`: loaded from their
 * store, saved on every change, and cleared only by `settleAttempt` or `reconcile`. When the
 * signed-in user changes, the next user's store is loaded instead, so one account never sees or
 * saves another's requests.
 */
export function useUnresolvedRequests<T>({ userId, openStore, reconcile }: {
  readonly userId: string;
  readonly openStore: (userId: string) => UnresolvedStore<T>;
  /** Clears requests whose outcome the server's current list establishes. */
  readonly reconcile: (saved: ReadonlyMap<string, T>) => ReadonlyMap<string, T>;
}): UnresolvedRequests<T> {
  const [loaded, setLoaded] = useState(() => load(userId, openStore));
  let current = loaded;
  if (loaded.userId !== userId) {
    current = load(userId, openStore);
    setLoaded(current);
  }
  const { store } = current;
  const unresolved = reconcile(current.saved);
  useEffect(() => { store.save(unresolved); }, [store, unresolved]);

  const update = (change: (saved: ReadonlyMap<string, T>) => ReadonlyMap<string, T>) =>
    setLoaded((latest) => (latest.store === store ? { ...latest, saved: change(reconcile(latest.saved)) } : latest));

  return {
    unresolved,
    begin: (sessionId, entry, wasRetry) => {
      if (!wasRetry) {
        const next = new Map(unresolved).set(sessionId, entry);
        store.save(next); // Now, not after the next render: the request is about to leave.
        update((saved) => new Map(saved).set(sessionId, entry));
      }
      return (outcome) => update((saved) => settleAttempt(saved, sessionId, entry, outcome, wasRetry));
    },
  };
}

function load<T>(userId: string, openStore: (userId: string) => UnresolvedStore<T>) {
  const store = openStore(userId);
  return { userId, store, saved: store.load() };
}
