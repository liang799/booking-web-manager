import type { UUID } from "@/domain";
import type { DiscoveredSession, SessionDiscoveryCriteria } from "./DiscoverSessions";

/** All PUBLIC, OPEN, strictly upcoming summaries, ordered by start then ID.
 * Full sessions remain discoverable. Start bounds are inclusive/exclusive.
 * A supplied viewer's COMMITTED and WAITLISTED sessions are excluded.
 * Readers do not hydrate Session aggregates or truncate the matching results.
 */
export interface SessionDiscoveryReader {
  search(criteria: SessionDiscoveryCriteria, now: Date, viewerId?: UUID): Promise<readonly DiscoveredSession[]>;
}

export interface SessionDiscoveryReads {
  readonly sessions: SessionDiscoveryReader;
}

/** Reads public listings from one consistent transaction snapshot. */
export interface SessionDiscoveryTransaction {
  run<T>(work: (reads: SessionDiscoveryReads) => Promise<T>): Promise<T>;
}
