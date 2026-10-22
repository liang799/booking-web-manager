import { createSessionFeedDependencies } from "@/use-case-config/session-feed";
import type { SessionFeedDependencies } from "./session-feed-dependencies";

let initialization: Promise<SessionFeedDependencies> | undefined;

/** Cache infrastructure only; each request supplies its own verified identity and cursor. */
export async function getSessionFeedDependencies(): Promise<SessionFeedDependencies> {
  initialization ??= Promise.resolve().then(createSessionFeedDependencies).catch((error) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}
