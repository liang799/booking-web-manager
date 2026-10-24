import type { UUID } from "@/domain";
import type { DiscoverSessions } from "@/use-cases/sessions/DiscoverSessions";

/** Discovery requires a verified login identity before any listing query. */
export interface DiscoveryDependencies {
  readonly authenticate: (request: Request) => Promise<UUID | null>;
  readonly discoverSessions: Pick<DiscoverSessions, "searchPublic">;
}
