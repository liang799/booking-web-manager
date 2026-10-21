import { z } from "zod";
import type { PersistStorage } from "zustand/middleware";
import { sessionFeedTabSchema, type SessionFeedTab } from "../session-feed-contract";

export interface SessionsUrlState {
  tab: SessionFeedTab;
  activeSessionId: string | null;
  panel: "details" | "participants";
}

const sessionIdSchema = z.string().uuid().transform((id) => id.toLowerCase());

export const sessionsUrlStateSchema = z.object({
  tab: sessionFeedTabSchema,
  activeSessionId: sessionIdSchema.nullable(),
  panel: z.enum(["details", "participants"]),
}).refine((state) => state.tab === "joined" || state.activeSessionId === null, {
  message: "Only Joined has a selected timeline session.",
}).refine((state) => state.activeSessionId !== null || state.panel === "details", {
  message: "A participant panel requires a selected session.",
});

/** Read only the overview's public URL fields; everything else remains transient. */
export function readSessionsUrlState(params: { get(name: string): string | null }): SessionsUrlState {
  const parsedTab = sessionFeedTabSchema.safeParse(params.get("tab"));
  const tab = params.get("created") === "1" ? "hosting" : parsedTab.success ? parsedTab.data : "joined";
  const parsedSession = sessionIdSchema.safeParse(params.get("session"));
  const activeSessionId = tab === "joined" && parsedSession.success ? parsedSession.data : null;
  return {
    tab,
    activeSessionId,
    panel: activeSessionId !== null && params.get("panel") === "participants" ? "participants" : "details",
  };
}

/** The caller owns browser history integration; this adapter owns only three query keys. */
export function createSessionsUrlStorage(getUrl: () => URL, replaceUrl: (url: URL) => void): PersistStorage<SessionsUrlState> {
  return {
    getItem: () => ({ state: readSessionsUrlState(getUrl().searchParams), version: 1 }),
    setItem: (_name, value) => {
      const parsed = sessionsUrlStateSchema.safeParse(value?.state);
      if (!parsed.success) return;
      const next = parsed.data;
      const url = new URL(getUrl().href);
      const current = readSessionsUrlState(url.searchParams);
      // Persist runs for every action, including unchanged transient UI state.
      if (current.tab === next.tab && current.activeSessionId === next.activeSessionId && current.panel === next.panel) return;
      url.searchParams.set("tab", next.tab);
      if (next.activeSessionId !== null) url.searchParams.set("session", next.activeSessionId);
      else url.searchParams.delete("session");
      if (next.panel === "participants") url.searchParams.set("panel", "participants");
      else url.searchParams.delete("panel");
      if (current.tab !== next.tab) url.searchParams.delete("created");
      replaceUrl(url);
    },
    removeItem: () => {
      const url = new URL(getUrl().href);
      if (!["tab", "session", "panel"].some((key) => url.searchParams.has(key))) return;
      for (const key of ["tab", "session", "panel"]) url.searchParams.delete(key);
      replaceUrl(url);
    },
  };
}
