import type { SqlExecutor } from "@/lib/money/sql";

/**
 * Tells sign-up whether an email already has an account, confirmed or not (UC1-01 4a).
 *
 * Supabase Auth reports a confirmed duplicate, but for an unconfirmed one it resends the
 * first confirmation email and answers like a new sign-up. Reading auth.users over the
 * server's database connection covers both. Deleted accounts don't count: account
 * deletion's soft delete scrambles their email and sets deleted_at.
 */
export class PostgresRegisteredEmails {
  constructor(private readonly sql: SqlExecutor) {}

  /** Compares emails ignoring case, as Supabase Auth does. */
  async hasAccount(email: string): Promise<boolean> {
    const rows = await this.sql.query(
      "select 1 from auth.users where lower(email) = lower($1) and deleted_at is null limit 1",
      [email],
    );
    return rows.length > 0;
  }
}
