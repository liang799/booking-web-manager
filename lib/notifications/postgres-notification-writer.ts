import type { SqlExecutor } from "@/lib/money/sql";
import type { NotificationIntent, NotificationWriter } from "@/use-cases/notifications/notification-intents";
import { encodeNotificationIntent } from "./notification-presentation";

/** Bound to the owning business transaction; its failure is deliberately not swallowed. */
export class PostgresNotificationWriter implements NotificationWriter {
  constructor(private readonly sql: SqlExecutor, private readonly occurrenceKey: string, private readonly recipients: Set<string>) {}

  async append(intents: readonly NotificationIntent[]): Promise<void> {
    if (!intents.length) return;
    const rows = await this.sql.query("select recipient_id from public.append_notifications($1::jsonb)", [JSON.stringify(intents.map((intent) => encodeNotificationIntent(intent, this.occurrenceKey)))]);
    for (const row of rows) this.recipients.add(String(row.recipient_id));
  }

  async groupMembers(groupId: string): Promise<readonly string[]> {
    const rows = await this.sql.query(
      `select m.user_id from group_memberships m join profiles p on p.user_id = m.user_id
       where m.group_id = $1 and p.account_status = 'ACTIVE' order by m.user_id`, [groupId]);
    return rows.map((row) => String(row.user_id));
  }
}
