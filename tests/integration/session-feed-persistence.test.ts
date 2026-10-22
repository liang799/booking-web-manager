import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { ParticipationStatus, SessionStatus } from "@/domain";
import { createPostgresExecutor } from "@/lib/database/postgres-executor";
import { PLATFORM_HOLDING_ACCOUNT_ID } from "@/lib/money/constants";
import { PostgresSessionFeedReader } from "@/lib/sessions/postgres-session-feed-reader";
import { ListSessionFeed, type SessionFeedPosition, type SessionFeedTab } from "@/use-cases/sessions/ListSessionFeed";
import { sessionTestContext, type SessionTestContext } from "../support/session-test-context";

const now = new Date("2042-01-15T00:00:00Z");

describe("PostgreSQL personal sessions feed", () => {
  let context: SessionTestContext;
  let hostId: string;
  let feed: ListSessionFeed;
  beforeAll(async () => {
    context = sessionTestContext();
    hostId = (await context.identity(false)).userId;
    feed = new ListSessionFeed({
      reader: new PostgresSessionFeedReader(createPostgresExecutor(() => context.pool)),
      clock: { now: () => now },
    });
  });
  afterAll(async () => { await context?.pool.end(); });

  async function insertSession(input: {
    sessionId?: string;
    bookerId?: string;
    startAt?: string;
    endAt?: string;
    visibility?: "PUBLIC" | "PRIVATE";
    status?: SessionStatus;
  } = {}) {
    const sessionId = input.sessionId ?? randomUUID();
    const startAt = new Date(input.startAt ?? "2042-01-16T00:00:00Z");
    const endAt = input.endAt ? new Date(input.endAt) : new Date(startAt.getTime() + 3_600_000);
    await context.pool.query(
      `insert into sessions (session_id, booker_id, venue_name, region, sport, start_at, end_at,
        total_cost_cents, total_slots, minimum_headcount, booking_share_cents, visibility, status,
        room_token, holding_account_id)
       values ($1,$2,'Personal feed court','West','Tennis',$3,$4,2000,4,2,500,$5,$6,$7,$8)`,
      [sessionId, input.bookerId ?? hostId, startAt, endAt, input.visibility ?? "PRIVATE",
        input.status ?? "OPEN", randomUUID(), PLATFORM_HOLDING_ACCOUNT_ID],
    );
    return sessionId;
  }

  async function participate(sessionId: string, userId: string, status: ParticipationStatus = "COMMITTED") {
    await context.pool.query(
      `insert into participations (participation_id, session_id, user_id, status, attendance,
        committed_at, withdrawn_at, waitlisted_at)
       values ($1,$2,$3,$4,'UNVERIFIED',$5,$6,$7)`,
      [randomUUID(), sessionId, userId, status,
        status === "COMMITTED" || status === "WITHDRAWN" ? now : null,
        status === "WITHDRAWN" ? now : null,
        status === "WAITLISTED" || status === "LEFT_WAITLIST" ? now : null],
    );
  }

  async function readAll(userId: string, tab: SessionFeedTab) {
    const sessions = [];
    let after: SessionFeedPosition | undefined;
    do {
      const page = await feed.list(userId, { tab, asOf: now, after });
      sessions.push(...page.sessions);
      after = page.next ?? undefined;
    } while (after);
    return sessions;
  }

  test("Joined isolates public and private enrollments and excludes owned and unrelated sessions", async () => {
    const { userId } = await context.identity(false);
    const expected = [];
    for (const visibility of ["PRIVATE", "PUBLIC"] as const) {
      const joined = await insertSession({ visibility });
      await participate(joined, userId);
      expected.push(joined);
      await insertSession({ visibility });
    }
    const owned = await insertSession({ bookerId: userId });
    await participate(owned, userId);
    const waitlisted = await insertSession();
    await participate(waitlisted, userId, "WAITLISTED");
    expected.push(waitlisted);
    const page = await feed.list(userId, { tab: "joined" });
    expect(page.sessions.map((session) => session.sessionId)).toEqual(expected.sort());
    expect(page).toMatchObject({ upcomingCount: 3, pastCount: 0, next: null });
    for (const session of page.sessions) {
      expect(session.role).toBe("PARTICIPANT");
      expect(session.unverifiedCount).toBe(0);
      expect(session).not.toHaveProperty("roomToken");
      expect(session).not.toHaveProperty("participants");
    }
    expect(page.sessions.find((session) => session.sessionId === waitlisted))
      .toMatchObject({ participationStatus: "WAITLISTED", participantCount: 0 });
    expect((await feed.list(userId, { tab: "hosting" })).sessions.map((session) => session.sessionId)).toEqual([owned]);
  });

  test("includes sessions in progress and preserves completed, cancelled and departed history", async () => {
    const { userId } = await context.identity(false);
    const current = await insertSession({ startAt: "2042-01-14T23:30:00Z", endAt: "2042-01-15T00:30:00Z" });
    await participate(current, userId);
    const ended = await insertSession({ startAt: "2042-01-14T00:00:00Z" });
    await participate(ended, userId);
    const settled = await insertSession({ status: "SETTLED", startAt: "2042-01-13T00:00:00Z" });
    await participate(settled, userId);
    const cancelled = await insertSession({ status: "CANCELLED", startAt: "2042-01-12T00:00:00Z" });
    await participate(cancelled, userId, "CANCELLED");
    const withdrawn = await insertSession({ startAt: "2042-01-17T00:00:00Z" });
    await participate(withdrawn, userId, "WITHDRAWN");
    const page = await feed.list(userId, { tab: "joined" });
    expect(page.sessions.map((session) => session.sessionId)).toEqual([current, withdrawn, ended, settled, cancelled]);
    expect(page.sessions.map((session) => session.section)).toEqual(["upcoming", "past", "past", "past", "past"]);
    expect(page).toMatchObject({ upcomingCount: 1, pastCount: 4 });
  });

  test("paginates tied upcoming and past timestamps across the section boundary without skips or duplicates", async () => {
    const { userId } = await context.identity(false);
    const upcoming = Array.from({ length: 15 }, () => randomUUID()).sort();
    const past = Array.from({ length: 15 }, () => randomUUID()).sort();
    for (const sessionId of [...upcoming].reverse()) await insertSession({ sessionId, bookerId: userId });
    for (const sessionId of [...past].reverse()) await insertSession({ sessionId, bookerId: userId, startAt: "2042-01-14T00:00:00Z" });
    const result = await readAll(userId, "hosting");
    expect(result.map((session) => session.sessionId)).toEqual([...upcoming, ...past]);
    expect(new Set(result.map((session) => session.sessionId)).size).toBe(30);
    const first = await feed.list(userId, { tab: "hosting" });
    expect(first).toMatchObject({ upcomingCount: 15, pastCount: 15 });
  });

  test("returns attendance counts only for a host's ended OPEN sessions", async () => {
    const { userId } = await context.identity(false);
    const player = (await context.identity(false)).userId;
    const ended = await insertSession({ bookerId: userId, startAt: "2042-01-14T00:00:00Z" });
    const future = await insertSession({ bookerId: userId });
    const settled = await insertSession({ bookerId: userId, status: "SETTLED", startAt: "2042-01-13T00:00:00Z" });
    for (const id of [ended, future, settled]) await participate(id, player);
    const page = await feed.list(userId, { tab: "hosting" });
    expect(page.sessions.find((session) => session.sessionId === ended)).toMatchObject({ participantCount: 1, unverifiedCount: 1 });
    expect(page.sessions.find((session) => session.sessionId === future)?.unverifiedCount).toBe(0);
    expect(page.sessions.find((session) => session.sessionId === settled)?.unverifiedCount).toBe(0);
  });

  test("missing and inactive identities cannot read sessions even through a valid cursor position", async () => {
    const { userId } = await context.identity(false);
    await insertSession({ bookerId: userId });
    await context.pool.query("update profiles set account_status = 'INACTIVE' where user_id = $1", [userId]);
    await expect(feed.list(userId, { tab: "hosting" })).rejects.toMatchObject({ code: "INACTIVE_ACCOUNT" });
    await expect(feed.list(randomUUID(), { tab: "hosting" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
