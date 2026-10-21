import { createStore } from "zustand/vanilla";
import type { SessionFeedTab } from "../session-feed-contract";

export type SessionDetailsPanel = "details" | "participants";

export type SessionsMode =
  | { status: "browsing" }
  | { status: "viewingSession"; sessionId: string };

export interface SessionsUiState {
  tab: SessionFeedTab;
  activeSessionId: string | null;
  mode: SessionsMode;
  detailPanels: Readonly<Record<string, SessionDetailsPanel>>;
}

export interface SessionsUiActions {
  selectTab(tab: SessionFeedTab): void;
  selectTimelineSession(id: string): void;
  openSession(sessionId: string): void;
  closeSession(): void;
  selectDetailPanel(sessionId: string, panel: SessionDetailsPanel): void;
}

export type SessionsUiStoreState = SessionsUiState & SessionsUiActions;

/** Each mounted sessions page owns its UI state; server data stays in React Query. */
export function createSessionsUiStore(initialTab: SessionFeedTab = "joined") {
  return createStore<SessionsUiStoreState>()((set) => ({
    tab: initialTab,
    activeSessionId: null,
    mode: { status: "browsing" },
    detailPanels: {},
    selectTab: (tab) => set((state) => state.tab === tab ? state : { tab, mode: { status: "browsing" } }),
    selectTimelineSession: (activeSessionId) => set((state) => state.activeSessionId === activeSessionId ? state : { activeSessionId }),
    // Only browsing opens a session; unrelated open/close events leave the mode unchanged.
    openSession: (sessionId) => set((state) => state.mode.status === "browsing" ? { mode: { status: "viewingSession", sessionId } } : state),
    closeSession: () => set((state) => state.mode.status === "viewingSession" ? { mode: { status: "browsing" } } : state),
    selectDetailPanel: (sessionId, panel) => set((state) => state.detailPanels[sessionId] === panel ? state : {
      detailPanels: { ...state.detailPanels, [sessionId]: panel },
    }),
  }));
}

export type SessionsUiStore = ReturnType<typeof createSessionsUiStore>;
