import { describe, expect, test, vi } from "vitest";
import { PostgresJoinedSessionsReader } from "@/lib/commit/postgres-joined-sessions-reader";
import { PostgresReplacementInvitationsReader } from "@/lib/commit/postgres-replacement-invitations-reader";
import type { SqlExecutor } from "@/lib/money/sql";

const sessionId = "10000000-0000-4000-8000-000000000001";
const startAt = new Date("2040-01-02T00:00:00Z");
const endAt = new Date("2040-01-02T02:00:00Z");
const row = {
  session_id: sessionId, venue_name: "Sports hall", sport: "Badminton", region: "West",
  start_at: startAt, end_at: endAt, booking_share_cents: "500",
  // Columns a careless query might return; they must never be exposed.
  room_token: "secret", booker_id: "other-user", replacement_invitee_id: "someone",
};

function sql() {
  return vi.fn<SqlExecutor["query"]>().mockResolvedValue([]);
}

function executor(query: ReturnType<typeof sql>): SqlExecutor {
  return { query: query as SqlExecutor["query"] };
}

describe.each([
  { name: "PostgresJoinedSessionsReader", create: (query: ReturnType<typeof sql>) => new PostgresJoinedSessionsReader(executor(query)) },
  { name: "PostgresReplacementInvitationsReader", create: (query: ReturnType<typeof sql>) => new PostgresReplacementInvitationsReader(executor(query)) },
])("$name", ({ create }) => {
  test("binds the identity and current time without reading ledger, wallet or token data", async () => {
    const query = sql();
    const userId = "' OR true --";
    const now = new Date("2040-01-01T00:00:00Z");

    await create(query).list(userId, now);

    const [statement, parameters] = query.mock.calls[0] ?? [];
    expect(statement).not.toContain(userId);
    expect(statement).not.toMatch(/ledger|wallet|room_token|select\s+\*|limit/);
    expect(parameters).toEqual([userId, now]);
  });

  test("only counts open sessions that have not started", async () => {
    const query = sql();

    await create(query).list("user", new Date());

    const [statement] = query.mock.calls[0] ?? [];
    expect(statement).toMatch(/s\.status = 'OPEN'/);
    expect(statement).toMatch(/s\.start_at > \$2/);
    expect(statement).toMatch(/order by s\.start_at asc, s\.session_id asc/);
  });

  test("rejects a malformed stored share instead of guessing an amount", async () => {
    const query = sql().mockResolvedValue([{ ...row, status: "COMMITTED", booking_share_cents: "5.5" }]);

    await expect(create(query).list("user", new Date())).rejects.toThrow();
  });
});

describe("PostgresJoinedSessionsReader", () => {
  test("maps committed and waitlisted places, exposing only summary fields and the stored share", async () => {
    const query = sql().mockResolvedValue([
      { ...row, status: "COMMITTED" },
      { ...row, status: "WAITLISTED" },
    ]);

    const sessions = await new PostgresJoinedSessionsReader(executor(query)).list("user", new Date());

    const summary = { sessionId, venueName: "Sports hall", sport: "Badminton", region: "West", startAt, endAt, bookingShareCents: 500 };
    expect(sessions).toEqual([
      { ...summary, status: "COMMITTED" },
      { ...summary, status: "WAITLISTED" },
    ]);
  });

  test("only selects the player's committed and waitlisted participations", async () => {
    const query = sql();

    await new PostgresJoinedSessionsReader(executor(query)).list("user", new Date());

    const [statement] = query.mock.calls[0] ?? [];
    expect(statement).toMatch(/p\.user_id = \$1/);
    expect(statement).toMatch(/p\.status in \('COMMITTED', 'WAITLISTED'\)/);
  });

  test("rejects a participation status it does not list", async () => {
    const query = sql().mockResolvedValue([{ ...row, status: "WITHDRAWN" }]);

    await expect(new PostgresJoinedSessionsReader(executor(query)).list("user", new Date())).rejects.toThrow();
  });
});

describe("PostgresReplacementInvitationsReader", () => {
  test("maps invitations without the withdrawer's identity", async () => {
    const query = sql().mockResolvedValue([row]);

    const invitations = await new PostgresReplacementInvitationsReader(executor(query)).list("user", new Date());

    expect(invitations).toEqual([
      { sessionId, venueName: "Sports hall", sport: "Badminton", region: "West", startAt, endAt, bookingShareCents: 500 },
    ]);
  });

  test("selects pending personal reservations naming the player, as the domain defines them", async () => {
    const query = sql();

    await new PostgresReplacementInvitationsReader(executor(query)).list("user", new Date());

    const [statement] = query.mock.calls[0] ?? [];
    expect(statement).toMatch(/p\.replacement_invitee_id = \$1/);
    expect(statement).toMatch(/p\.status = 'WITHDRAWN'/);
    expect(statement).toMatch(/p\.replacement_mode = 'DIRECT_INVITE'/);
    expect(statement).toMatch(/h\.state in \('AWAITING_REPLACEMENT', 'REFUNDED'\)/);
    expect(statement).toMatch(/r\.replaces_participation_id = p\.participation_id/);
  });
});
