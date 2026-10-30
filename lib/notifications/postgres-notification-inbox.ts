import { DomainError } from "@/domain";
import type { SqlExecutor, SqlRow } from "@/lib/money/sql";
import { pushPayloadFor } from "@/lib/commit/web-push-notifier";
import type { CommitmentNotification } from "@/use-cases/sessions/commitment-notifications";
import type { InboxNotification, NotificationCursor, NotificationFilter, NotificationInbox, NotificationPage } from "@/use-cases/notifications/notification-inbox";

const PAGE_SIZE = 30;

/** Parameterized, recipient-scoped operations. No browser receives privileged credentials. */
export class PostgresNotificationInbox implements NotificationInbox {
  constructor(private readonly sql: SqlExecutor) {}

  async save(notification: CommitmentNotification): Promise<void> {
    const payload = pushPayloadFor(notification);
    // The committed action key survives replay and distinguishes waitlist re-entry.
    // A verification reminder has one occurrence per session.
    const source = JSON.stringify([notification.kind, notification.sessionId, notification.occurrenceKey ?? notification.sessionId]);
    await this.sql.query(
      `insert into notification_inbox (recipient_id, source_key, category, title, body, destination)
       select user_id, $2, 'bookings', $3, $4, $5 from profiles where user_id = $1 and account_status = 'ACTIVE'
       on conflict (recipient_id, source_key) do nothing`,
      [notification.recipientId, source, payload.title, payload.body, payload.url],
    );
  }

  async list(userId: string, filter: NotificationFilter, before?: NotificationCursor): Promise<NotificationPage> {
    // One statement gives the page and full unread count the same snapshot.
    const rows = await this.sql.query(
      `with actor as (select user_id as id from profiles where user_id = $1 and account_status = 'ACTIVE'),
       page as (
         select n.* from notification_inbox n join actor on actor.id = n.recipient_id
         where ($2 = 'all' or ($2 = 'unread' and n.read_at is null) or n.category = $2)
           and ($3::timestamptz is null or (n.created_at, n.id) < ($3::timestamptz, $4::uuid))
         order by n.created_at desc, n.id desc limit $5
       )
       select exists(select 1 from actor) as active,
         (select count(*)::int from notification_inbox n join actor on actor.id = n.recipient_id where read_at is null) as unread_count,
         coalesce((select jsonb_agg(page order by created_at desc, id desc) from page), '[]'::jsonb) as items`,
      [userId, filter, before?.createdAt ?? null, before?.id ?? null, PAGE_SIZE + 1],
    );
    const result = rows[0];
    if (result?.active !== true) throw new DomainError("INACTIVE_ACCOUNT", "This account is not active");
    if (!Array.isArray(result.items)) throw new Error("Invalid inbox result");
    const items = result.items.map(notificationFromRow);
    const page = items.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    return {
      items: page,
      unreadCount: Number(result.unread_count),
      nextCursor: items.length > PAGE_SIZE && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }

  async markRead(userId: string, id: string): Promise<void> {
    const rows = await this.sql.query(
      `with actor as (select user_id as id from profiles where user_id = $1 and account_status = 'ACTIVE'),
       updated as (
         update notification_inbox set read_at = clock_timestamp()
         where recipient_id in (select id from actor) and read_at is null
           and ($2 = 'all' or id::text = $2)
         returning id
       ) select exists(select 1 from actor) as active`,
      [userId, id],
    );
    if (rows[0]?.active !== true) throw new DomainError("INACTIVE_ACCOUNT", "This account is not active");
  }
}

function notificationFromRow(row: SqlRow): InboxNotification {
  return {
    id: String(row.id), category: row.category as InboxNotification["category"],
    title: String(row.title), body: String(row.body), url: String(row.destination),
    createdAt: new Date(String(row.created_at)),
    readAt: row.read_at === null ? null : new Date(String(row.read_at)),
  };
}
