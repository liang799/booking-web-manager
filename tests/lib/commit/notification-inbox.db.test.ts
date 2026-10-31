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
    await pool.query(readFileSync("supabase/migrations/0018_notification_inbox.sql", "utf8").replaceAll("public.", `"${schema}".`));
    await pool.query("insert into profiles values ($1, 'ACTIVE'), ($2, 'ACTIVE')", [actor, other]);
  });
  afterAll(async () => { await pool.query(`drop schema if exists "${schema}" cascade`); await pool.end(); });

  test("deduplicates replay and retains distinct committed occurrences without server read state", async () => {
    const notification = { kind: "PROMOTED" as const, recipientId: actor, sessionId, occurrenceKey: randomUUID() };
    await Promise.all([inbox.save(notification), inbox.save(notification)]);
    const page = await inbox.list(actor, "all");
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).not.toHaveProperty("readAt");
    expect(page).not.toHaveProperty("unreadCount");
    expect(page.retentionCutoff).toBeInstanceOf(Date);
    await inbox.save({ ...notification, occurrenceKey: randomUUID() });
    expect((await inbox.list(actor, "all")).items).toHaveLength(2);
  });

  test("isolates recipients and does not expose expired notification history", async () => {
    await inbox.save({ kind: "VERIFICATION_REMINDER", recipientId: other, sessionId });
    const otherPage = await inbox.list(other, "all");
    expect((await inbox.list(actor, "all")).items.map((item) => item.id)).not.toContain(otherPage.items[0]!.id);
    await pool.query("update notification_inbox set created_at=now()-interval '31 days' where recipient_id=$1",[other]);
    expect((await inbox.list(other,"all")).items).toEqual([]);
  });

  test("equal timestamps paginate without omissions", async () => {
    const user = randomUUID();
    await pool.query("insert into profiles values ($1, 'ACTIVE')", [user]);
    for (let i = 0; i < 65; i++) await inbox.save({ kind: "PROMOTED", recipientId: user, sessionId, occurrenceKey: randomUUID() });
    await pool.query("update notification_inbox set created_at = date_trunc('milliseconds',now()-interval '1 day') where recipient_id=$1", [user]);
    const first=await inbox.list(user,"bookings"),second=await inbox.list(user,"bookings",first.nextCursor!),third=await inbox.list(user,"bookings",second.nextCursor!);
    expect([first.items.length,second.items.length,third.items.length]).toEqual([30,30,5]);
    expect(new Set([...first.items,...second.items,...third.items].map((item)=>item.id)).size).toBe(65);
    expect(third.nextCursor).toBeNull();
    expect((await inbox.list(user,"payments")).items).toEqual([]);
  });

  test("rechecks account status for reads and writes", async () => {
    await pool.query("update profiles set account_status='INACTIVE' where user_id=$1",[other]);
    await expect(inbox.list(other,"all")).rejects.toMatchObject({code:"INACTIVE_ACCOUNT"});
    const count=(await pool.query("select count(*)::int as count from notification_inbox where recipient_id=$1",[other])).rows[0].count;
    await inbox.save({kind:"PROMOTED",recipientId:other,sessionId});
    expect((await pool.query("select count(*)::int as count from notification_inbox where recipient_id=$1",[other])).rows[0].count).toBe(count);
  });

  test("browser roles have neither direct table access nor an RLS policy", async () => {
    const result = await pool.query("select has_table_privilege('authenticated', $1, 'select') as can_read, has_table_privilege('anon', $1, 'update') as can_write", [`${schema}.notification_inbox`]);
    expect(result.rows[0]).toEqual({ can_read: false, can_write: false });
    expect((await pool.query("select relrowsecurity from pg_class where oid = $1::regclass", [`${schema}.notification_inbox`])).rows[0].relrowsecurity).toBe(true);
  });
});
