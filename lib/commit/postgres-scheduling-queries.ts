import type { Pool } from "pg";
import type { SqlExecutor } from "@/lib/money/sql";
import { PostgresDueSessionQuery } from "./postgres-due-session-query";
import { PostgresDurableVerificationReminders } from "./postgres-durable-verification-reminders";
import { PostgresTransactor } from "@/lib/database/postgres-transactor";

/**
 * Creates the scheduled sweep's Postgres queries over the shared pool. Each
 * query is a single autocommit statement, so they run on pooled connections
 * outside the commitment unit of work.
 */
export function createPostgresSchedulingQueries(getPool: () => Pool, publish: (recipients: readonly string[]) => void = () => {}) {
  const sql: SqlExecutor = {
    query: async (statement, values) =>
      (await getPool().query(statement, values ? [...values] : undefined)).rows,
  };
  return {
    dueSessions: new PostgresDueSessionQuery(sql),
    verificationReminders: new PostgresDurableVerificationReminders(new PostgresTransactor(getPool(), "read committed"), publish),
  };
}
