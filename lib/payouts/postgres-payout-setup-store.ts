import type { Pool } from "pg";
import { DomainError, type User, type UUID } from "@/domain";
import { PostgresTransactor } from "@/lib/database/postgres-transactor";
import { isRetryable } from "@/lib/money/errors";
import type { SqlExecutor } from "@/lib/money/sql";
import { text } from "@/lib/sessions/postgres-row-values";
import { PostgresUserReader } from "@/lib/sessions/postgres-user-reader";
import type { Clock } from "@/use-cases/shared/contracts";
import type {
  PayoutSetupStore,
  ProviderEvent,
  ProviderEventOutcome,
} from "@/use-cases/payouts/SetUpPayoutAccount";

const MAX_ATTEMPTS = 3;

/**
 * Persists payout setup for UC1-07 through the complete User aggregate.
 *
 * Each call is one READ COMMITTED transaction. The profile row is locked
 * `FOR UPDATE` first, so concurrent setup requests for one user serialize and
 * the second sees what the first saved; account deactivation takes the same
 * row, so it cannot interleave with a setup change either. Provider events
 * are recorded in `processed_events` inside the same transaction as their
 * effect, so a replayed webhook finds its ID and changes nothing.
 *
 * Nothing here calls the payout provider (CLAUDE.md rule #4).
 */
export class PostgresPayoutSetupStore implements PayoutSetupStore {
  constructor(
    private readonly getPool: () => Pool,
    private readonly clock: Clock,
  ) {}

  forUser<T>(userId: UUID, work: (user: User) => T): Promise<T> {
    return this.#transaction(async (sql) => {
      const user = await this.#lockAndLoad(sql, userId);
      const result = work(user);
      await savePayoutSetup(sql, user);
      return result;
    });
  }

  forProviderAccount<T>(
    accountReference: string,
    event: ProviderEvent,
    work: (user: User) => T,
  ): Promise<ProviderEventOutcome<T>> {
    return this.#transaction(async (sql): Promise<ProviderEventOutcome<T>> => {
      const owners = await sql.query(
        "select user_id from payout_accounts where provider_account_reference = $1",
        [accountReference],
      );
      const owner = owners[0];
      if (owner === undefined) return { kind: "UNKNOWN_ACCOUNT" };

      // A concurrent delivery of the same event waits here on the unique key,
      // then finds it recorded once the first commits.
      const recorded = await sql.query(
        `insert into processed_events (event_id, provider, event_type, processed_at)
         values ($1, 'stripe', $2, now())
         on conflict (event_id) do nothing
         returning event_id`,
        [event.eventId, event.eventType],
      );
      if (recorded[0] === undefined) return { kind: "DUPLICATE" };

      const user = await this.#lockAndLoad(sql, text(owner.user_id));
      const result = work(user);
      await savePayoutSetup(sql, user);
      return { kind: "APPLIED", result };
    });
  }

  async #lockAndLoad(sql: SqlExecutor, userId: UUID): Promise<User> {
    const profiles = await sql.query(
      "select user_id from profiles where user_id = $1 for update",
      [userId],
    );
    if (profiles[0] === undefined)
      throw new DomainError("NOT_FOUND", "The profile was not found");
    const user = await new PostgresUserReader(sql, this.clock).get(userId);
    if (user === null) throw new DomainError("NOT_FOUND", "The profile was not found");
    return user;
  }

  async #transaction<T>(work: (sql: SqlExecutor) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await new PostgresTransactor(this.getPool(), "read committed").transaction(work);
      } catch (error) {
        if (isRetryable(error) && attempt < MAX_ATTEMPTS) continue;
        throw error;
      }
    }
  }
}

/** Writes the User's payout setup child; a user has at most one row. */
async function savePayoutSetup(sql: SqlExecutor, user: User): Promise<void> {
  const account = user.payoutAccount;
  if (account === undefined) return;
  await sql.query(
    `insert into payout_accounts
       (payout_account_id, user_id, provider_account_reference, bank_account_reference, setup_status)
     values ($1, $2, $3, $4, $5)
     on conflict (user_id) do update set
       payout_account_id = excluded.payout_account_id,
       provider_account_reference = excluded.provider_account_reference,
       bank_account_reference = excluded.bank_account_reference,
       setup_status = excluded.setup_status`,
    [
      account.payoutAccountId,
      account.userId,
      account.providerAccountReference,
      account.bankAccountReference ?? null,
      account.setupStatus,
    ],
  );
}
