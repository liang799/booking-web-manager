import { randomUUID } from "node:crypto";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { PLATFORM_HOLDING_ACCOUNT_ID } from "@/lib/money/constants";
import { sessionTestContext, sessionTestEnvironment, type SessionTestContext } from "../support/session-test-context";

/** Runs only against the disposable stack, with its real Realtime service enabled. */
describe("UC2-01 / UC2-03a database broadcast invalidation", () => {
  let context: SessionTestContext;
  let client: SupabaseClient;
  let channel: RealtimeChannel;
  let bookerId: string;
  const messages: unknown[] = [];

  beforeAll(async () => {
    context = sessionTestContext();
    bookerId = (await context.identity(false)).userId;
    const settings = sessionTestEnvironment();
    client = createClient(settings.supabaseUrl, settings.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Disposable Realtime did not subscribe")), 10_000);
      channel = client.channel("discovery:public:v1", { config: { private: false } })
        .on("broadcast", { event: "invalidate" }, (message) => { messages.push(message.payload); })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") { clearTimeout(timeout); resolve(); }
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            clearTimeout(timeout); reject(new Error(`Disposable Realtime: ${status}`));
          }
        });
    });
  });
  afterAll(async () => {
    if (channel !== undefined) await client.removeChannel(channel);
    client?.realtime.disconnect();
    await context?.pool.end();
  });

  async function insert(visibility = "PUBLIC", status = "OPEN", offset = 86_400_000) {
    const sessionId = randomUUID();
    const startAt = new Date(Date.now() + offset);
    await context.pool.query(
      `insert into sessions (session_id, booker_id, venue_name, region, sport, start_at, end_at,
         total_cost_cents, total_slots, minimum_headcount, booking_share_cents, visibility, status,
         room_token, holding_account_id)
       values ($1,$2,$3,'West','Badminton',$4,$5,200,2,2,100,$6,$7,$8,$9)`,
      [sessionId, bookerId, `Realtime-${sessionId}`, startAt, new Date(startAt.getTime() + 7_200_000),
        visibility, status, randomUUID(), PLATFORM_HOLDING_ACCOUNT_ID],
    );
    return sessionId;
  }

  async function expectEvents(count: number) {
    await expect.poll(() => messages.length, { timeout: 3_000 }).toBe(count);
    expect(messages).toEqual(Array.from({ length: count }, () => ({})));
  }

  test("anonymous clients receive creation, hide, publish and cancellation without row data", async () => {
    const before = messages.length;
    const id = await insert();
    await expectEvents(before + 1);
    await context.pool.query("update sessions set visibility='PRIVATE' where session_id=$1", [id]);
    await expectEvents(before + 2);
    await context.pool.query("update sessions set visibility='PUBLIC' where session_id=$1", [id]);
    await expectEvents(before + 3);
    await context.pool.query("update sessions set status='CANCELLED' where session_id=$1", [id]);
    await expectEvents(before + 4);
  });

  test("private, past, closed and unchanged public rows do not emit hints", async () => {
    const baseline = messages.length;
    const id = await insert();
    await expectEvents(baseline + 1);
    const before = messages.length;
    const privateId = await insert("PRIVATE");
    await context.pool.query("update sessions set venue_name='Still private' where session_id=$1", [privateId]);
    await insert("PUBLIC", "OPEN", -86_400_000);
    await insert("PUBLIC", "CANCELLED");
    await context.pool.query("update sessions set venue_name=venue_name where session_id=$1", [id]);
    await context.pool.query("update sessions set next_queue_sequence=next_queue_sequence+1 where session_id=$1", [id]);
    // A subsequent committed public write is the WAL delivery barrier, not a sleep.
    await insert();
    await expectEvents(before + 1);
  });

  test("public projection edits and deletion invalidate discovery", async () => {
    const before = messages.length;
    const id = await insert();
    await expectEvents(before + 1);
    await context.pool.query("update sessions set end_at=end_at + interval '1 minute' where session_id=$1", [id]);
    await expectEvents(before + 2);
    await context.pool.query("delete from sessions where session_id=$1", [id]);
    await expectEvents(before + 3);
  });

  test("rolled-back updates do not emit and browser session-table access stays revoked", async () => {
    const before = messages.length;
    const id = await insert();
    await expectEvents(before + 1);
    const connection = await context.pool.connect();
    try {
      await connection.query("begin");
      await connection.query("update sessions set visibility='PRIVATE' where session_id=$1", [id]);
      await connection.query("rollback");
    } finally { connection.release(); }
    await insert();
    await expectEvents(before + 2);
    const grants = await context.pool.query(
      "select has_table_privilege('anon', 'public.sessions', 'SELECT') as anon, has_table_privilege('authenticated', 'public.sessions', 'SELECT') as authenticated",
    );
    expect(grants.rows).toEqual([{ anon: false, authenticated: false }]);
  });
});
