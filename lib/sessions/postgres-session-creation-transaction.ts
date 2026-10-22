import type { Pool } from "pg";
import { bookingAccountIneligibility, DomainError, type UUID } from "@/domain";
import { PostgresTransactor } from "@/lib/database/postgres-transactor";
import { LedgerError } from "@/lib/money/errors";
import { LedgerUnitOfWork } from "@/lib/money/ledger-unit-of-work";
import type { SqlExecutor } from "@/lib/money/sql";
import type { Clock } from "@/use-cases/shared/contracts";
import type {
  SessionCreationRepositories,
  SessionCreationTransaction,
} from "@/use-cases/sessions/session-creation-transaction";
import type { RequestBoundSessionCreationSubmission, SessionCreationSubmission } from "./request-session-creation-transaction";
import { PostgresSessionWriter } from "./postgres-session-writer";
import { PostgresUserReader } from "./postgres-user-reader";
import { choice, SessionPersistenceError } from "./postgres-row-values";

export class PostgresSessionCreationTransaction
  implements SessionCreationTransaction
{
  private readonly transactor: PostgresTransactor;
  private readonly idempotencyKey: string;
  private readonly request: RequestBoundSessionCreationSubmission["request"] | undefined;

  constructor(
    pool: Pool,
    submission: SessionCreationSubmission | RequestBoundSessionCreationSubmission,
    private readonly clock: Clock,
  ) {
    this.transactor = new PostgresTransactor(pool);
    this.idempotencyKey = submission.idempotencyKey;
    // Capture a snapshot: later caller mutation must not change the replay identity.
    this.request = "request" in submission ? structuredClone(submission.request) : undefined;
  }

  async runForBooker<T>(
    bookerId: UUID,
    work: (repositories: SessionCreationRepositories) => Promise<T>,
  ): Promise<T> {
    if (this.request !== undefined && this.request.bookerId !== bookerId) {
      throw new SessionPersistenceError("Submission identity does not match the booker");
    }
    const key = JSON.stringify(["UC2-02", bookerId, this.idempotencyKey]);
    // Authorize every transaction attempt before a durable replay can reveal its room token.
    // Keep payout and booking-time rules inside new creation, preserving eligible replay.
    const unitOfWork = new LedgerUnitOfWork({
      transaction: (perform) => this.transactor.transaction(async (sql) => {
        await assertCurrentBookerAccess(sql, bookerId);
        return perform(sql);
      }),
    });
    const operation = { idempotencyKey: key, scope: "UC2-02" };
    const legacyRequest = { idempotencyKey: key };
    try {
      return await unitOfWork.execute(
        { ...operation, request: this.request ?? legacyRequest },
        ({ sql }) =>
          work({
            users: new PostgresUserReader(sql, this.clock),
            sessions: new PostgresSessionWriter(sql, bookerId),
          }),
      );
    } catch (error) {
      if (this.request === undefined || !(error instanceof LedgerError) || error.code !== "IDEMPOTENCY_CONFLICT") {
        throw error;
      }
      // Older successful keys never stored the payload. Probe their original
      // fingerprint for replay only, retaining the same actor-scoped key.
      // A new payload-bound key still conflicts here. If the row disappears or
      // was not successful, this callback must NEVER create another session.
      return unitOfWork.execute(
        { ...operation, request: legacyRequest },
        async () => { throw error; },
      );
    }
  }
}

/** Only trusted account facts are read before replay; complete hydration remains creation-owned. */
async function assertCurrentBookerAccess(sql: SqlExecutor, bookerId: UUID): Promise<void> {
  const rows = await sql.query(
    `select p.account_status, u.email
     from profiles p join auth.users u on u.id = p.user_id
     where p.user_id = $1 for share of p, u`,
    [bookerId],
  );
  const account = rows[0];
  DomainError.require(account !== undefined, "NOT_FOUND", "User was not found");
  const accountStatus = choice(account.account_status, ["ACTIVE", "INACTIVE"]);
  const hasEmail = typeof account.email === "string" && account.email.trim() !== "";
  const reason = bookingAccountIneligibility({
    accountStatus,
    hasEmail,
  });
  if (reason !== undefined)
    throw new DomainError(reason, reason === "INACTIVE_ACCOUNT"
      ? "An inactive booker cannot create a session"
      : "Add an email address before creating a session");
}
