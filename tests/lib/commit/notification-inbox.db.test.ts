import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { PostgresNotificationInbox } from "@/lib/notifications/postgres-notification-inbox";

// Opt-in PostgreSQL test, isolated in a unique schema. The fixture supplies only
// the profiles columns used here; the real new migration is applied verbatim
// except for qualifying its objects with the isolated schema instead of public.
const databaseUrl = process.env.NOTIFICATION_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("PostgreSQL notification inbox", () => {
  const schema = `notifications_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema},public` });
  const inbox = new PostgresNotificationInbox({ query: async (sql, values) => (await pool.query(sql, values ? [...values] : undefined)).rows });
  const actor = randomUUID();
  const other = randomUUID();
  const sessionId = randomUUID();
  beforeAll(async () => {
    await pool.query(`create schema "${schema}"`);
    await pool.query(`create table profiles (user_id uuid primary key, account_status text not null)`);
    await pool.query(readFileSync("supabase/migrations/0017_notification_inbox.sql", "utf8").replaceAll("public.", `"${schema}".`));
    await pool.query("insert into profiles values ($1, 'ACTIVE'), ($2, 'ACTIVE')", [actor, other]);
  });
  afterAll(async () => { await pool.query(`drop schema if exists "${schema}" cascade`); await pool.end(); });

  test("persists alerts, deduplicates replay without resetting read state, and keeps distinct occurrences", async () => {
    const notification = { kind: "PROMOTED" as const, recipientId: actor, sessionId, occurrenceKey: randomUUID() };
    await Promise.all([inbox.save(notification), inbox.save(notification)]);
    const page = await inbox.list(actor, "all");
    expect(page.items).toHaveLength(1);
    expect(page.unreadCount).toBe(1);
    expect(page.items[0]).toMatchObject({ title: "You're in!", category: "bookings", url: "/sessions/joined", readAt: null });
    await inbox.markRead(actor, page.items[0]!.id);
    await inbox.save(notification);
    const replay = await inbox.list(actor, "all");
    expect(replay.items).toHaveLength(1);
    expect(replay.items[0]!.readAt).toBeInstanceOf(Date);
    expect(replay.unreadCount).toBe(0);
    await inbox.save({ ...notification, occurrenceKey: randomUUID() });
    expect((await inbox.list(actor, "all")).items).toHaveLength(2);
  });

  test("cannot read or mark another recipient's notifications, including mark all", async () => {
    await inbox.save({ kind: "VERIFICATION_REMINDER", recipientId: other, sessionId });
    const otherPage = await inbox.list(other, "all");
    await inbox.markRead(actor, otherPage.items[0]!.id);
    await inbox.markRead(actor, "all");
    expect((await inbox.list(actor, "unread")).items).toEqual([]);
    expect((await inbox.list(other, "unread")).unreadCount).toBe(1);
    expect((await inbox.list(actor, "all")).items.map((item) => item.id)).not.toContain(otherPage.items[0]!.id);
  });

  test("a later waitlist removal is a new unread alert even when the recipient and session are unchanged", async () => {
    const user = randomUUID();
    await pool.query("insert into profiles values ($1, 'ACTIVE')", [user]);
    const event = { kind: "REMOVED_FROM_WAITLIST" as const, recipientId: user, sessionId, reason: "INSUFFICIENT_FUNDS" as const };
    await inbox.save({ ...event, occurrenceKey: "first-promotion" });
    const first = (await inbox.list(user, "all")).items[0]!;
    await inbox.markRead(user, first.id);
    await inbox.save({ ...event, occurrenceKey: "promotion-after-reentry" });
    await inbox.save({ ...event, occurrenceKey: "promotion-after-reentry" });
    const page = await inbox.list(user, "all");
    expect(page.items).toHaveLength(2);
    expect(page.unreadCount).toBe(1);
    expect(page.items.find((item) => item.id === first.id)?.readAt).toBeInstanceOf(Date);
  });

  test("equal timestamps paginate without omissions and counts cover the whole inbox", async () => {
    const user = randomUUID();
    await pool.query("insert into profiles values ($1, 'ACTIVE')", [user]);
    for (let i = 0; i < 65; i++) await inbox.save({ kind: "PROMOTED", recipientId: user, sessionId, occurrenceKey: randomUUID() });
    await pool.query("update notification_inbox set created_at = '2026-10-29T01:00:00.123Z' where recipient_id = $1", [user]);
    const first = await inbox.list(user, "bookings");
    const second = await inbox.list(user, "bookings", first.nextCursor!);
    const third = await inbox.list(user, "bookings", second.nextCursor!);
    expect([first.items.length, second.items.length, third.items.length]).toEqual([30, 30, 5]);
    expect(new Set([...first.items, ...second.items, ...third.items].map((item) => item.id)).size).toBe(65);
    expect(third.nextCursor).toBeNull();
    expect(first.unreadCount).toBe(65);
    expect((await inbox.list(user, "payments"))).toMatchObject({ items: [], unreadCount: 65 });
  });

  test("rechecks account status for reads and writes and does not persist new alerts for inactive users", async () => {
    await pool.query("update profiles set account_status = 'INACTIVE' where user_id = $1", [other]);
    await expect(inbox.list(other, "all")).rejects.toMatchObject({ code: "INACTIVE_ACCOUNT" });
    await expect(inbox.markRead(other, "all")).rejects.toMatchObject({ code: "INACTIVE_ACCOUNT" });
    await inbox.save({ kind: "PROMOTED", recipientId: other, sessionId });
    expect((await pool.query("select count(*)::int as count from notification_inbox where recipient_id = $1", [other])).rows[0].count).toBe(1);
  });

  test("browser roles have neither direct table access nor an RLS policy", async () => {
    const result = await pool.query("select has_table_privilege('authenticated', $1, 'select') as can_read, has_table_privilege('anon', $1, 'update') as can_write", [`${schema}.notification_inbox`]);
    expect(result.rows[0]).toEqual({ can_read: false, can_write: false });
    expect((await pool.query("select relrowsecurity from pg_class where oid = $1::regclass", [`${schema}.notification_inbox`])).rows[0].relrowsecurity).toBe(true);
  });
});
