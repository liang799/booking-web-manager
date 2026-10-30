import type { UUID } from "@/domain";
import type { DiscoverSessions } from "@/use-cases/sessions/DiscoverSessions";

/** Session discovery uses verified identity to exclude the viewer's active participation. */
export interface DiscoveryDependencies {
  readonly authenticate: (request: Request) => Promise<UUID | null>;
  readonly discoverSessions: Pick<DiscoverSessions, "searchPublic">;
}
