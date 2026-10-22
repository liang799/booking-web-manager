import { describe, expect, test, vi } from "vitest";
import type { SqlExecutor, SqlRow } from "@/lib/money/sql";
import { SessionPersistenceError } from "@/lib/sessions/postgres-row-values";
import { PostgresReliabilityHistoryReader } from "@/lib/supabase/postgres-reliability-history-reader";

const committedAt = new Date("2026-10-01T10:00:00Z");
const endAt = new Date("2026-10-01T12:00:00Z");

/** A stored participation joined with its session's end time and its fund hold. */
function historyRow(overrides: SqlRow = {}): SqlRow {
  return {
    session_id: "s", participation_id: "p", user_id: "alice", status: "COMMITTED", attendance: "ATTENDED",
    waitlisted_at: null, committed_at: committedAt, withdrawn_at: null, replacement_mode: null, replacement_invitee_id: null,
    verified_at: endAt, verification_method: "BOOKER", replaces_participation_id: null, queue_sequence: null,
    end_at: endAt, hold_id: "h", hold_participation_id: "p", holding_account_id: "platform", wallet_id: "wallet",
    payout_id: null, amount_cents: "500", hold_state: "HELD", hold_created_at: committedAt, settled_at: null,
    ...overrides,
  };
}

/** Answers the history query with `history`, then the wallet query with `wallets`. */
function database(history: readonly SqlRow[], wallets: readonly SqlRow[] = [{ wallet_id: "wallet" }]) {
  const query = vi.fn<SqlExecutor["query"]>().mockResolvedValueOnce(history).mockResolvedValueOnce(wallets);
  return { query, reader: new PostgresReliabilityHistoryReader({ query: query as SqlExecutor["query"] }) };
}

describe("PostgresReliabilityHistoryReader", () => {
  test("returns no history, without reading the wallet, when the user has never joined a session", async () => {
    // Arrange
    const { query, reader } = database([]);

    // Act
    const history = await reader.historyFor("alice");

    // Assert
    expect(history).toEqual([]);
    expect(query).toHaveBeenCalledOnce();
  });

  test("reads only the requested user's participations, without row locks", async () => {
    // Arrange
    const { query, reader } = database([historyRow()]);

    // Act
    await reader.historyFor("alice");

    // Assert
    expect(query.mock.calls[0]?.[0]).toContain("where p.user_id = $1");
    expect(query.mock.calls[0]?.[0]).not.toMatch(/for (share|update)/i);
    expect(query.mock.calls[0]?.[1]).toEqual(["alice"]);
    expect(query.mock.calls[1]?.[1]).toEqual(["alice"]);
  });

  test("maps each row to the participation and its session's end time", async () => {
    // Arrange
    const { reader } = database([historyRow(), historyRow({ participation_id: "q", hold_id: null, status: "LEFT_WAITLIST", attendance: "UNVERIFIED", verified_at: null, verification_method: null })]);

    // Act
    const history = await reader.historyFor("alice");

    // Assert
    expect(history.map((entry) => entry.participation.participationId)).toEqual(["p", "q"]);
    expect(history[0]?.participation.attendance).toBe("ATTENDED");
    expect(history[0]?.participation.hold?.amount.toCents()).toBe(500);
    expect(history[0]?.endAt).toEqual(endAt);
    expect(history[1]?.participation.hold).toBeUndefined();
  });

  test("reports history without a wallet as bad stored data", async () => {
    // Arrange
    const { reader } = database([historyRow()], []);

    // Act & Assert
    await expect(reader.historyFor("alice")).rejects.toBeInstanceOf(SessionPersistenceError);
  });

  test("reports an unreadable stored row as bad stored data, keeping the cause", async () => {
    // Arrange
    const { reader } = database([historyRow({ status: "SOMETHING_ELSE" })]);

    // Act
    const failure = await reader.historyFor("alice").catch((error: unknown) => error);

    // Assert
    expect(failure).toBeInstanceOf(SessionPersistenceError);
    expect((failure as Error).cause).toBeDefined();
  });

  test("passes a database failure through unchanged", async () => {
    // Arrange
    const failure = Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
    const reader = new PostgresReliabilityHistoryReader({ query: async () => { throw failure; } });

    // Act & Assert
    await expect(reader.historyFor("alice")).rejects.toBe(failure);
  });
});
