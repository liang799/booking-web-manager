"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import type { SessionFeedTab } from "../session-feed-contract";
import { createSessionsUiStore, type SessionsUiStore, type SessionsUiStoreState } from "./sessions-ui-store";

const SessionsUiContext = createContext<SessionsUiStore | null>(null);

export function SessionsUiProvider({ children, initialTab = "joined" }: {
  readonly children: ReactNode;
  readonly initialTab?: SessionFeedTab;
}) {
  const [store] = useState(() => createSessionsUiStore(initialTab));
  return <SessionsUiContext.Provider value={store}>{children}</SessionsUiContext.Provider>;
}

export function useSessionsUiStore<T>(selector: (state: SessionsUiStoreState) => T): T {
  const store = useContext(SessionsUiContext);
  if (!store) throw new Error("useSessionsUiStore must be used within a SessionsUiProvider.");
  return useStore(store, selector);
}
