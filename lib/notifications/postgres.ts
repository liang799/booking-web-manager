import type { Pool } from "pg";
import { PostgresNotificationInbox } from "./postgres-notification-inbox";

export function createNotificationInbox(getPool: () => Pool) {
  return new PostgresNotificationInbox({
    query: async (statement, values) => (await getPool().query(statement, values ? [...values] : undefined)).rows,
  });
}
