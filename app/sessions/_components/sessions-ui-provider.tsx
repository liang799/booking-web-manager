"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import type { PersistStorage } from "zustand/middleware";
import type { SessionFeedTab } from "../session-feed-contract";
import type { SessionsUrlState } from "./sessions-url-storage";
import { createSessionsUiStore, type SessionsUiStore, type SessionsUiStoreState } from "./sessions-ui-store";

const SessionsUiContext = createContext<SessionsUiStore | null>(null);
const detachedStorage: PersistStorage<SessionsUrlState> = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

export function SessionsUiProvider({ children, initialTab = "joined", persistence }: {
  readonly children: ReactNode;
  readonly initialTab?: SessionFeedTab;
  readonly persistence?: {
    readonly storage: PersistStorage<SessionsUrlState>;
    readonly search: string;
    readonly resetSelection: boolean;
  };
}) {
  const [store] = useState(() => createSessionsUiStore(initialTab, persistence?.storage));
  const mounted = useRef(false);
  const storage = persistence?.storage;
  const search = persistence?.search;
  const resetSelection = persistence?.resetSelection;
  useEffect(() => {
    if (!storage) return;
    // A late async action from an unmounted account must not rewrite the current
    // page's URL. Reconnect on setup as well, including StrictMode's effect replay.
    store.persist.setOptions({ storage });
    return () => store.persist.setOptions({ storage: detachedStorage });
  }, [store, storage]);
  useEffect(() => {
    if (!storage) return;
    if (!mounted.current && resetSelection) {
      // Switching accounts clears the previous account's selection before hydration.
      void storage.setItem("sessions-overview", { state: { tab: store.getState().tab, activeSessionId: null, panel: "details" }, version: 1 });
    }
    mounted.current = true;
    void store.persist.rehydrate();
  }, [store, storage, search, resetSelection]);
  useEffect(() => {
    if (!storage) return;
    const restore = () => { void store.persist.rehydrate(); };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [store, storage]);
  return <SessionsUiContext.Provider value={store}>{children}</SessionsUiContext.Provider>;
}

export function useSessionsUiStore<T>(selector: (state: SessionsUiStoreState) => T): T {
  const store = useContext(SessionsUiContext);
  if (!store) throw new Error("useSessionsUiStore must be used within a SessionsUiProvider.");
  return useStore(store, selector);
}
