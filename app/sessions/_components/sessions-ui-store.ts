import { createStore } from "zustand/vanilla";
import { persist, type PersistStorage } from "zustand/middleware";
import type { SessionFeedTab } from "../session-feed-contract";
import { sessionsUrlStateSchema, type SessionsUrlState } from "./sessions-url-storage";

export type SessionDetailsPanel = "details" | "participants";

export type SessionsMode =
  | { status: "browsing" }
  | { status: "viewingSession"; sessionId: string };

export interface SessionsUiState {
  tab: SessionFeedTab;
  activeSessionId: string | null;
  /** A URL navigation requests one scroll after its session has loaded. */
  scrollTargetId: string | null;
  mode: SessionsMode;
  detailPanels: Readonly<Record<string, SessionDetailsPanel>>;
}

export interface SessionsUiActions {
  selectTab(tab: SessionFeedTab): void;
  selectTimelineSession(id: string): void;
  clearTimelineSession(): void;
  finishUrlRestoration(): void;
  openSession(sessionId: string): void;
  closeSession(): void;
  selectDetailPanel(sessionId: string, panel: SessionDetailsPanel): void;
}

export type SessionsUiStoreState = SessionsUiState & SessionsUiActions;

/** Each mounted sessions page owns its UI state; server data stays in React Query. */
export function createSessionsUiStore(initialTab: SessionFeedTab = "joined", storage?: PersistStorage<SessionsUrlState>) {
  return createStore<SessionsUiStoreState>()(persist((set) => ({
    tab: initialTab,
    activeSessionId: null,
    scrollTargetId: null,
    mode: { status: "browsing" },
    detailPanels: {},
    selectTab: (tab) => set((state) => state.tab === tab ? state : { tab, mode: { status: "browsing" }, scrollTargetId: null }),
    selectTimelineSession: (activeSessionId) => set((state) => state.activeSessionId === activeSessionId && !state.scrollTargetId ? state : { activeSessionId, scrollTargetId: null }),
    clearTimelineSession: () => set((state) => state.activeSessionId === null && state.scrollTargetId === null ? state : { activeSessionId: null, scrollTargetId: null }),
    finishUrlRestoration: () => set((state) => state.scrollTargetId === null ? state : { scrollTargetId: null }),
    // Only browsing opens a session; unrelated open/close events leave the mode unchanged.
    openSession: (sessionId) => set((state) => state.mode.status === "browsing" ? { mode: { status: "viewingSession", sessionId } } : state),
    closeSession: () => set((state) => state.mode.status === "viewingSession" ? { mode: { status: "browsing" } } : state),
    selectDetailPanel: (sessionId, panel) => set((state) => {
      // The first timeline card is implicit until the user interacts with it.
      const selectFirst = state.tab === "joined" && state.mode.status === "browsing" && state.activeSessionId === null;
      if (state.detailPanels[sessionId] === panel && !selectFirst) return state;
      return {
        activeSessionId: selectFirst ? sessionId : state.activeSessionId,
        detailPanels: { ...state.detailPanels, [sessionId]: panel },
      };
    }),
  }), {
    name: "sessions-overview",
    version: 1,
    // Storybook views and server rendering never fall back to localStorage.
    storage: storage ?? { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    skipHydration: true,
    partialize: (state): SessionsUrlState => ({
      tab: state.tab,
      activeSessionId: state.tab === "joined" ? state.activeSessionId : null,
      panel: state.tab === "joined" && state.activeSessionId ? state.detailPanels[state.activeSessionId] ?? "details" : "details",
    }),
    merge: (persisted, current) => {
      const parsed = sessionsUrlStateSchema.safeParse(persisted);
      if (!parsed.success) return current;
      const { tab, activeSessionId, panel } = parsed.data;
      const sameSelection = tab === current.tab && (tab === "hosting" || (
        activeSessionId === current.activeSessionId && (!activeSessionId || panel === (current.detailPanels[activeSessionId] ?? "details"))
      ));
      // A store-originated URL update must not close a dialog or replay scrolling.
      if (sameSelection) return current;
      return {
        ...current,
        tab,
        activeSessionId: tab === "joined" ? activeSessionId : current.activeSessionId,
        detailPanels: activeSessionId ? { ...current.detailPanels, [activeSessionId]: panel } : current.detailPanels,
        mode: { status: "browsing" },
        scrollTargetId: activeSessionId,
      };
    },
  }));
}

export type SessionsUiStore = ReturnType<typeof createSessionsUiStore>;
