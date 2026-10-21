import { createStore } from "zustand/vanilla";
import type { SessionFeedTab } from "../session-feed-contract";

export type SessionDetailsPanel = "details" | "participants";

export interface SessionsUiState {
  tab: SessionFeedTab;
  activeSessionId: string | null;
  selectedSessionId: string | null;
  detailPanels: Readonly<Record<string, SessionDetailsPanel>>;
}

export interface SessionsUiActions {
  selectTab(tab: SessionFeedTab): void;
  selectTimelineSession(id: string): void;
  selectSession(id: string | null): void;
  selectDetailPanel(sessionId: string, panel: SessionDetailsPanel): void;
}

export type SessionsUiStoreState = SessionsUiState & SessionsUiActions;

/** Each mounted sessions page owns its UI state; server data stays in React Query. */
export function createSessionsUiStore(initialTab: SessionFeedTab = "joined") {
  return createStore<SessionsUiStoreState>()((set) => ({
    tab: initialTab,
    activeSessionId: null,
    selectedSessionId: null,
    detailPanels: {},
    selectTab: (tab) => set((state) => state.tab === tab ? state : { tab, selectedSessionId: null }),
    selectTimelineSession: (activeSessionId) => set((state) => state.activeSessionId === activeSessionId ? state : { activeSessionId }),
    selectSession: (selectedSessionId) => set((state) => state.selectedSessionId === selectedSessionId ? state : { selectedSessionId }),
    selectDetailPanel: (sessionId, panel) => set((state) => state.detailPanels[sessionId] === panel ? state : {
      detailPanels: { ...state.detailPanels, [sessionId]: panel },
    }),
  }));
}

export type SessionsUiStore = ReturnType<typeof createSessionsUiStore>;
