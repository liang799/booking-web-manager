import { DomainError } from "@/domain";
import type { SqlExecutor, SqlRow } from "@/lib/money/sql";
import { pushPayloadFor } from "@/lib/commit/web-push-notifier";
import type { CommitmentNotification } from "@/use-cases/sessions/commitment-notifications";
import type { InboxNotification, NotificationCursor, NotificationFilter, NotificationInbox, NotificationPage } from "@/use-cases/notifications/notification-inbox";

const PAGE_SIZE = 30;

/** Parameterized, recipient-scoped operations. No browser receives privileged credentials. */
export class PostgresNotificationInbox implements NotificationInbox {
  constructor(private readonly sql: SqlExecutor) {}

  /** Compatibility for historical test adapters only. Production writes use their business transaction's writer. */
  async save(notification: CommitmentNotification): Promise<void> {
    const payload = pushPayloadFor(notification);
    const source = JSON.stringify([notification.kind, notification.sessionId, notification.occurrenceKey ?? notification.sessionId]);
    await this.sql.query(
      `insert into notification_inbox (recipient_id, source_key, category, title, body, destination)
       select user_id, $2, 'bookings', $3, $4, $5 from profiles where user_id = $1 and account_status = 'ACTIVE'
       on conflict (recipient_id, source_key) do nothing`,
      [notification.recipientId, source, payload.title, payload.body, payload.url],
    );
  }

  async list(userId: string, filter: NotificationFilter, before?: NotificationCursor): Promise<NotificationPage> {
    const rows = await this.sql.query(
      `with cutoff as (select statement_timestamp()-interval '30 days' as value),
       actor as (select user_id as id from profiles where user_id=$1 and account_status='ACTIVE'),
       page as (
         select n.id,n.category,n.title,n.body,n.destination,n.created_at from notification_inbox n join actor on actor.id=n.recipient_id
         where ($2='all' or n.category=$2) and n.created_at>=(select value from cutoff)
           and ($3::timestamptz is null or (n.created_at,n.id)<($3::timestamptz,$4::uuid))
         order by n.created_at desc,n.id desc limit $5
       ) select exists(select 1 from actor) as active,(select value from cutoff) as retention_cutoff,
         coalesce((select jsonb_agg(page order by created_at desc,id desc) from page),'[]'::jsonb) as items`,
      [userId,filter,before?.createdAt ?? null,before?.id ?? null,PAGE_SIZE+1],
    );
    const result=rows[0];
    if (result?.active!==true) throw new DomainError("INACTIVE_ACCOUNT","This account is not active");
    if (!Array.isArray(result.items)) throw new Error("Invalid inbox result");
    const items=result.items.map(notificationFromRow),page=items.slice(0,PAGE_SIZE),last=page.at(-1);
    return { items:page,retentionCutoff:new Date(String(result.retention_cutoff)),
      nextCursor:items.length>PAGE_SIZE && last ? { createdAt:last.createdAt,id:last.id } : null };
  }
}
function notificationFromRow(row: SqlRow): InboxNotification {
  return { id:String(row.id),category:row.category as InboxNotification["category"],title:String(row.title),body:String(row.body),url:String(row.destination),createdAt:new Date(String(row.created_at)) };
}
