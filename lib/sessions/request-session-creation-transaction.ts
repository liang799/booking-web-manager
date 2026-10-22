import type { UUID } from "@/domain";
import type {
  SessionCreationRepositories,
  SessionCreationTransaction,
} from "@/use-cases/sessions/session-creation-transaction";
import type { SessionBooking, SessionConfig } from "@/use-cases/sessions/CreateSessions";
import type { UnitOfWork } from "@/use-cases/shared/contracts";

/** Identifies retries of one logical session-creation submission. */
export interface SessionCreationSubmission {
  readonly idempotencyKey: string;
}

/**
 * Opt-in request binding for HTTP creation. The API supplies only parsed input;
 * the persistence adapter owns hashing, comparison and atomic replay.
 * The key-only shape remains supported for existing non-HTTP adapters/callers.
 */
export interface RequestBoundSessionCreationSubmission extends SessionCreationSubmission {
  readonly request: {
    readonly bookerId: UUID;
    readonly booking: Readonly<SessionBooking>;
    readonly config: Readonly<SessionConfig>;
  };
}

/**
 * Binds creation to one logical submission. Rebuild it with the same key for a
 * retry, or a new key for a new session. The unit of work atomically persists
 * the session and replay result; this adapter does not implement storage.
 */
export class RequestSessionCreationTransaction
  implements SessionCreationTransaction
{
  private readonly idempotencyKey: string;

  constructor(
    private readonly unitOfWork: UnitOfWork,
    submission: SessionCreationSubmission,
  ) {
    this.idempotencyKey = submission.idempotencyKey;
  }

  runForBooker<T>(
    bookerId: UUID,
    work: (repositories: SessionCreationRepositories) => Promise<T>,
  ): Promise<T> {
    const key = JSON.stringify(["UC2-02", bookerId, this.idempotencyKey]);

    return this.unitOfWork.execute(key, (transaction) =>
      work({ users: transaction.users, sessions: transaction.sessions }),
    );
  }
}
