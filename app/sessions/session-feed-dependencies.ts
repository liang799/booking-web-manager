import type { UUID } from "@/domain";
import type { ListSessionFeed } from "@/use-cases/sessions/ListSessionFeed";

export interface SessionFeedDependencies {
  readonly authenticate: (request: Request) => Promise<UUID | null>;
  readonly sessionFeed: Pick<ListSessionFeed, "list">;
}
