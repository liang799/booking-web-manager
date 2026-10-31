import type { Region, Sport, UUID } from "@/domain";
import type { Clock } from "../shared/contracts";
import type { SessionDiscoveryTransaction } from "./session-discovery-transaction";

/** Public listing projection: no admission, participant, or payment secrets. */
export interface DiscoveredSession {
  readonly sessionId: UUID;
  readonly venueName: string;
  readonly sport: Sport;
  readonly region: Region;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly totalSlots: number;
  readonly bookingShareCents: number;
}

export interface SessionDiscoveryCriteria {
  /** Case-insensitive literal substring of the sport or venue name. */
  readonly text?: string;
  readonly sport?: Sport;
  readonly region?: Region;
  readonly startsWithin?: {
    readonly from?: Date;
    readonly before?: Date;
  };
}

/**
 * UC2-01: discover public matches, optionally excluding the viewer's active participation.
 * Results are public, open and strictly upcoming, including full sessions,
 * ordered by start time and session ID.
 */
export class DiscoverSessions {
  constructor(
    private readonly dependencies: {
      readonly transaction: SessionDiscoveryTransaction;
      readonly clock: Clock;
    },
  ) {}

  /** Viewer identity scopes results without adding participant details to the public projection. */
  async searchPublic(criteria: SessionDiscoveryCriteria = {}, viewerId?: UUID): Promise<readonly DiscoveredSession[]> {
    return this.dependencies.transaction.run(({ sessions }) =>
      sessions.search(criteria, this.dependencies.clock.now(), viewerId),
    );
  }
}
