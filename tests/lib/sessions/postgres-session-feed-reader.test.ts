import { describe, expect, test, vi } from "vitest";
import type { SqlExecutor, SqlRow } from "@/lib/money/sql";
import { PostgresSessionFeedReader } from "@/lib/sessions/postgres-session-feed-reader";

const now = new Date("2042-01-15T00:00:00Z");

function summary(overrides: SqlRow = {}): SqlRow {
  return {
    account_status: "ACTIVE", upcoming_count: 1, past_count: 0,
    session_id: "session", venue_name: "Court", sport: "Tennis", region: "West",
    start_at: new Date("2042-01-16T00:00:00Z"), end_at: new Date("2042-01-16T01:00:00Z"),
    total_slots: 3, booking_share_cents: "500", visibility: "PUBLIC", status: "OPEN",
    participation_status: null, section_order: 0, participant_count: 0, unverified_count: 0,
    ...overrides,
  };
}

describe("PostgresSessionFeedReader participant counts", () => {
  test.each([
    ["OPEN", 0, 1],
    ["OPEN", 2, 3],
    ["AWAITING_PAYOUT", 2, 3],
    ["SETTLED", 2, 3],
    ["CANCELLED", 0, 0],
  ])("includes the reserved booker place for %s sessions with %i committed guests", async (status, guests, expected) => {
    const query = vi.fn(async () => [summary({ status, participant_count: guests })]);
    const reader = new PostgresSessionFeedReader({ query: query as SqlExecutor["query"] });

    const result = await reader.read({ userId: "host", tab: "hosting", asOf: now, limit: 12 });

    expect(result.sessions[0]).toMatchObject({ capacity: 3, participantCount: expected, unverifiedCount: 0 });
  });

  test("does not add the booker to the number requiring attendance verification", async () => {
    const query = vi.fn(async () => [summary({ participant_count: 2, unverified_count: 1 })]);
    const reader = new PostgresSessionFeedReader({ query: query as SqlExecutor["query"] });

    const result = await reader.read({ userId: "host", tab: "hosting", asOf: now, limit: 12 });

    expect(result.sessions[0]).toMatchObject({ participantCount: 3, unverifiedCount: 1 });
  });
});
