import { withNotificationPublication } from "@/lib/notifications/transaction-publication";
import { PostgresNotificationWriter } from "@/lib/notifications/postgres-notification-writer";
import type { Pool } from "pg";
import { bookingAccountIneligibility, DomainError, type UUID } from "@/domain";
import { PostgresTransactor } from "@/lib/database/postgres-transactor";
import { LedgerError } from "@/lib/money/errors";
import { fingerprintOf, PostgresIdempotencyStore } from "@/lib/money/idempotency";
import { LedgerUnitOfWork } from "@/lib/money/ledger-unit-of-work";
import type { SqlExecutor } from "@/lib/money/sql";
import type { Clock } from "@/use-cases/shared/contracts";
import type {
  SessionCreationRepositories,
  SessionCreationTransaction,
} from "@/use-cases/sessions/session-creation-transaction";
import type { SessionCreationSubmission } from "./request-session-creation-transaction";
import { PostgresSessionWriter } from "./postgres-session-writer";
import { PostgresUserReader } from "./postgres-user-reader";
import { choice, SessionPersistenceError } from "./postgres-row-values";

export class PostgresSessionCreationTransaction
  implements SessionCreationTransaction
{
  private readonly transactor: PostgresTransactor;
  private readonly idempotencyKey: string;
  private readonly request: SessionCreationSubmission["request"];

  constructor(
    pool: Pool,
    submission: SessionCreationSubmission,
    private readonly clock: Clock,
    private readonly publish: (recipients: readonly string[]) => void = () => {},
  ) {
    this.transactor = new PostgresTransactor(pool);
    this.idempotencyKey = submission.idempotencyKey;
    // Capture a snapshot: later caller mutation must not change the replay identity.
    this.request = structuredClone(submission.request);
  }

  async runForBooker<T>(
    bookerId: UUID,
    work: (repositories: SessionCreationRepositories) => Promise<T>,
  ): Promise<T> {
    if (this.request !== undefined && this.request.bookerId !== bookerId) {
      throw new SessionPersistenceError("Submission identity does not match the booker");
    }
    const key = JSON.stringify(["UC2-02", bookerId, this.idempotencyKey]);
    const operation = { idempotencyKey: key, scope: "UC2-02" };
    const legacyRequest = { idempotencyKey: key };
    // Authorize every transaction attempt before a durable replay can reveal its room token.
    // Keep payout and booking-time rules inside new creation, preserving eligible replay.
    const notificationWriters = new WeakMap<SqlExecutor, PostgresNotificationWriter>();
    const unitOfWork = new LedgerUnitOfWork({
      transaction: (perform) => withNotificationPublication((recipients) => this.transactor.transaction(async (sql) => {
        notificationWriters.set(sql, new PostgresNotificationWriter(sql, key, recipients));
        await assertCurrentBookerAccess(sql, bookerId);
        try {
          return await perform(sql);
        } catch (error) {
          if (this.request === undefined || !(error instanceof LedgerError) || error.code !== "IDEMPOTENCY_CONFLICT") {
            throw error;
          }
          // A fingerprint conflict leaves the SQL transaction usable. Probe
          // historical successful formats under this attempt's authorization;
          // the surrounding unit of work still retries whole transactions.
          const existing = (await sql.query(
            `select status, request_fingerprint from idempotency_keys
             where idempotency_key = $1 for share`,
            [key],
          ))[0];
          const compatible = existing?.status === "SUCCEEDED"
            ? requestWithRetiredHeadcount(this.request, existing.request_fingerprint)
            : undefined;
          const claim = await new PostgresIdempotencyStore(sql).claim({
            ...operation,
            fingerprint: fingerprintOf(compatible ?? legacyRequest),
          });
          // Never run work for a historical probe, even if the key disappears
          // or a failed key is reclaimed. Throwing rolls back such a claim.
          if (claim.status !== "REPLAY") throw error;
          return claim.value as Awaited<ReturnType<typeof perform>>;
        }
      }), this.publish),
    });
    return unitOfWork.execute(
      { ...operation, request: this.request ?? legacyRequest },
      ({ sql }) =>
        work({
          users: new PostgresUserReader(sql, this.clock),
          sessions: new PostgresSessionWriter(sql, bookerId),
          notifications: notificationWriters.get(sql)!,
        }),
    );
  }
}

/** Only the retired, historically valid field may differ from the parsed retry. */
function requestWithRetiredHeadcount(
  request: NonNullable<SessionCreationSubmission["request"]>,
  fingerprint: unknown,
): SessionCreationSubmission["request"] {
  const { totalSlots } = request.config;
  // The old creation contract allowed 2–30 places and headcounts 2–capacity.
  if (!Number.isInteger(totalSlots) || totalSlots < 2 || totalSlots > 30) return undefined;
  for (let minimumHeadcount = 2; minimumHeadcount <= totalSlots; minimumHeadcount += 1) {
    const candidate = { ...request, config: { ...request.config, minimumHeadcount } };
    if (fingerprintOf(candidate) === fingerprint) return candidate;
  }
  return undefined;
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
