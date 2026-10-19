import { Pool } from "pg";
import { beforeEach, expect, test, vi } from "vitest";
import type { SqlExecutor, SqlTransactor } from "@/lib/money/sql";
import { PostgresInvitedSessionReader } from "@/lib/sessions/postgres-invited-session-reader";

const mocks = vi.hoisted(() => ({ query: vi.fn<SqlExecutor["query"]>() }));
vi.mock("@/lib/database/postgres-transactor", () => ({
  PostgresTransactor: class implements SqlTransactor {
    transaction<T>(work: (sql: SqlExecutor) => Promise<T>): Promise<T> {
      return work({ query: mocks.query as SqlExecutor["query"] });
    }
  },
}));

const sessionId = "10000000-0000-4000-8000-000000000001";
const now = new Date("2035-01-01T00:00:00Z");
beforeEach(() => { vi.resetAllMocks(); mocks.query.mockResolvedValue([]); });

test("binds identity, exact token and a strict future boundary without exposing the token or reading users", async () => {
  const token = " MiXeD +/?#%'; drop table sessions; -- ";
  const reader = new PostgresInvitedSessionReader(() => new Pool());
  expect(await reader.findByToken(sessionId, token, now)).toBeNull();

  const [statement, values] = mocks.query.mock.calls[0]!;
  expect(statement).toContain("session_id = $1 and room_token = $2 and status = 'OPEN' and start_at > $3");
  expect(statement).not.toContain(token);
  expect(statement).not.toMatch(/\bjoin\b|participations|fund_holds|wallet|profiles|auth\.users|\b(update|insert|delete)\b|select\s+\*/i);
  expect(statement.split("from sessions")[0]).not.toContain("room_token");
  expect(values).toEqual([sessionId, token, now]);
});

test("projects only safe display facts even if the driver returns additional sensitive columns", async () => {
  const startAt = new Date("2035-01-02T00:00:00Z");
  const endAt = new Date("2035-01-02T01:00:00Z");
  mocks.query.mockResolvedValue([{
    session_id: sessionId, venue_name: "Court", sport: "Tennis", region: "West", start_at: startAt,
    end_at: endAt, total_slots: 8, booking_share_cents: "333", room_token: "secret",
    booker_id: "owner", participants: ["private"], wallet_id: "wallet",
  }]);
  const reader = new PostgresInvitedSessionReader(() => new Pool());

  expect(await reader.findByToken(sessionId, "secret", now)).toEqual({
    sessionId, venueName: "Court", sport: "Tennis", region: "West", startAt, endAt,
    totalSlots: 8, bookingShareCents: 333,
  });
});

test("rejects unsafe stored money without silently rounding the invitee's price", async () => {
  mocks.query.mockResolvedValue([{
    session_id: sessionId, venue_name: "Court", sport: "Tennis", region: "West", start_at: now,
    end_at: now, total_slots: 8, booking_share_cents: "9007199254740992",
  }]);
  await expect(new PostgresInvitedSessionReader(() => new Pool()).findByToken(sessionId, "token", now)).rejects.toThrow();
});

test("preserves infrastructure failure instead of returning an invalid-invitation result", async () => {
  const failure = new Error("Database unavailable");
  mocks.query.mockRejectedValue(failure);
  await expect(new PostgresInvitedSessionReader(() => new Pool()).findByToken(sessionId, "token", now)).rejects.toBe(failure);
});
