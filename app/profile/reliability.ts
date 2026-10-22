import { cache } from "react";
import { ReliabilityUnavailableError } from "./reliability-dependencies";
import { getReliabilityDependencies } from "./reliability-server-dependencies";

/**
 * The signed-in user's reliability score (0–100) for Settings and the sidebar, or null when it
 * can't be read. Null is shown as unavailable, never as the starting score. Pass only the
 * verified current user's ID. Wrapped in cache() so one request reads the history once.
 */
export const loadReliabilityScore = cache(async (userId: string): Promise<number | null> => {
  try {
    const dependencies = await getReliabilityDependencies();
    return (await dependencies.reliabilityScore.forUser(userId)).toNumber();
  } catch (error) {
    if (!(error instanceof ReliabilityUnavailableError)) {
      console.error("UC1-03 reliability score read failed:", error instanceof Error ? error.name : "unknown");
    }
    return null;
  }
});
