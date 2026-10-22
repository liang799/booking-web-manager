import { describe, expect, test, vi } from "vitest";
import { LedgerError } from "@/lib/money/errors";
import type { SqlExecutor, SqlRow } from "@/lib/money/sql";
import { PostgresWalletReader } from "@/lib/wallet/postgres-wallet-reader";

const createdAt = new Date("2026-10-17T03:00:00Z");
const hold = { hold_id: "hold-a", session_id: "session-a", held_cents: "350",
  original_cents: "500", created_at: createdAt, venue_name: "Sports Hall", sport: "Badminton", start_at: createdAt };
const ledgerEntry = {
  entry_id: "entry-a", kind: "LOCK", amount_cents: "1250", occurred_at: createdAt,
  idempotency_key: "lock-a", external_reference: null, wallet_id: "wallet-a",
  hold_id: "hold-a", payout_id: null,
};

function setup(rows: readonly SqlRow[]) {
  const query = vi.fn<(statement: string, values?: readonly unknown[]) => Promise<readonly SqlRow[]>>().mockResolvedValue(rows);
  const sql: SqlExecutor = {
    query: async <Row extends SqlRow>(statement: string, values?: readonly unknown[]) =>
      await query(statement, values) as readonly Row[],
  };
  return { query, reader: new PostgresWalletReader(sql) };
}

describe("Postgres wallet reads", () => {
  test("adds session sport without changing the bounded ledger page or its order", async () => {
    const { reader, query } = setup([]);
    query.mockResolvedValueOnce([
      ledgerEntry,
      { ...ledgerEntry, entry_id: "entry-b", kind: "TOP_UP", hold_id: null, idempotency_key: "top-up-b" },
    ]).mockResolvedValueOnce([
      { entry_id: "entry-b", sport: null },
      { entry_id: "entry-a", sport: "Badminton" },
    ]);
    const before = new Date("2026-10-18T00:00:00Z");

    const result = await reader.listWalletTransactions({ walletId: "wallet-a", limit: 2, occurredBefore: before });

    expect(result.map((transaction) => transaction.transactionId)).toEqual(["entry-a", "entry-b"]);
    expect(result[0]).toMatchObject({ sport: "Badminton", occurredAt: createdAt, kind: "LOCK" });
    expect(result[0]?.amount.toCents()).toBe(1250);
    expect(result[1]?.sport).toBeUndefined();
    expect(query.mock.calls[0]?.[1]).toEqual(["wallet-a", before, 2]);
    expect(query.mock.calls[1]).toEqual([
      expect.stringContaining("left join sessions s on s.session_id = e.session_id"),
      ["wallet-a", ["entry-a", "entry-b"]],
    ]);
    expect(query.mock.calls[1]?.[0]).toContain("where e.wallet_id = $1");
  });

  test("keeps transactions when their session enrichment is unavailable", async () => {
    const { reader, query } = setup([]);
    query.mockResolvedValueOnce([ledgerEntry]).mockResolvedValueOnce([]);
    const result = await reader.listWalletTransactions({ walletId: "wallet-a" });
    expect(result).toHaveLength(1);
    expect(result[0]?.transactionId).toBe("entry-a");
    expect(result[0]?.sport).toBeUndefined();
  });

  test("does not query session details for an empty ledger page", async () => {
    const { reader, query } = setup([]);
    expect(await reader.listWalletTransactions({ walletId: "wallet-a" })).toEqual([]);
    expect(query).toHaveBeenCalledOnce();
  });

  test("rejects malformed session context instead of passing invalid sport values to the page", async () => {
    const { reader, query } = setup([]);
    query.mockResolvedValueOnce([ledgerEntry]).mockResolvedValueOnce([{ entry_id: "entry-a", sport: 123 }]);
    await expect(reader.listWalletTransactions({ walletId: "wallet-a" })).rejects.toMatchObject({
      name: "LedgerError", code: "INVARIANT_VIOLATED",
    });
  });

  test("reads all requested withdrawal amounts for the booker without a page limit", async () => {
    const { reader, query } = setup([{ pending_cents: "1850" }]);
    expect((await reader.getPendingPayoutAmount("booker-a")).toCents()).toBe(1850);
    const [statement, values] = query.mock.calls[0]!;
    expect(statement).toContain("sum(pa.amount_cents)");
    expect(statement).toContain("join sessions s on s.session_id = pa.session_id");
    expect(statement).toContain("where s.booker_id = $1 and pa.status = 'REQUESTED'");
    expect(statement).not.toMatch(/\blimit\b/i);
    expect(values).toEqual(["booker-a"]);
  });

  test("maps the empty withdrawal aggregate to zero", async () => {
    const { reader } = setup([{ pending_cents: "0" }]);
    expect((await reader.getPendingPayoutAmount("booker-a")).toCents()).toBe(0);
  });

  test.each(["9007199254740993", "3.5", "-1", null, undefined])(
    "rejects invalid pending withdrawal cents %s",
    async (pending_cents) => {
      const { reader } = setup([{ pending_cents }]);
      await expect(reader.getPendingPayoutAmount("booker-a")).rejects.toMatchObject({
        name: "LedgerError", code: "INVARIANT_VIOLATED",
      });
    },
  );

  test("does not treat a failed withdrawal read as no pending funds", async () => {
    const { reader, query } = setup([]);
    const failure = Object.assign(new Error("database failure"), { code: "40001" });
    query.mockRejectedValue(failure);
    await expect(reader.getPendingPayoutAmount("booker-a")).rejects.toMatchObject({
      name: "LedgerError", code: "SERIALISATION_FAILURE", cause: failure,
    });
  });

  test("maps integer-cent holds and session details scoped to the wallet", async () => {
    const { reader, query } = setup([hold]);
    const result = await reader.listActiveHolds("wallet-a");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("where h.wallet_id = $1 and h.held_cents > 0"), ["wallet-a"]);
    expect(result[0]).toMatchObject({ holdId: "hold-a", sessionId: "session-a", venueName: "Sports Hall", createdAt });
    expect(result[0]!.heldAmount.toCents()).toBe(350);
    expect(result[0]!.originalAmount.toCents()).toBe(500);
  });

  test("retains a hold when joined session details are absent", async () => {
    const { reader } = setup([{ ...hold, venue_name: null, sport: null, start_at: null }]);
    expect((await reader.listActiveHolds("wallet-a"))[0]).toMatchObject({
      holdId: "hold-a", venueName: undefined, sport: undefined, startAt: undefined,
    });
  });

  test.each(["9007199254740993", "3.5", null])("rejects lossy or missing stored cents %s", async (held_cents) => {
    const { reader } = setup([{ ...hold, held_cents }]);
    await expect(reader.listActiveHolds("wallet-a")).rejects.toMatchObject({
      name: "LedgerError", code: "INVARIANT_VIOLATED",
    });
  });

  test.each([
    ["hold_id", null],
    ["session_id", ""],
    ["created_at", new Date("invalid")],
    ["created_at", null],
    ["venue_name", 123],
    ["sport", ""],
    ["start_at", new Date("invalid")],
  ] as const)("reports malformed stored %s as a ledger invariant failure", async (column, value) => {
    const { reader } = setup([{ ...hold, [column]: value }]);
    await expect(reader.listActiveHolds("wallet-a")).rejects.toMatchObject({
      name: "LedgerError", code: "INVARIANT_VIOLATED",
    });
  });

  test.each([
    ["40001", "SERIALISATION_FAILURE"],
    ["40P01", "DEADLOCK"],
    ["23503", "UNKNOWN_ACCOUNT"],
  ])("translates database failure %s consistently with inherited reads", async (sqlState, code) => {
    const { reader, query } = setup([]);
    const failure = Object.assign(new Error("database failure"), { code: sqlState });
    query.mockRejectedValue(failure);
    await expect(reader.listActiveHolds("wallet-a")).rejects.toMatchObject({
      name: "LedgerError", code, cause: failure,
    });
  });

  test("preserves an existing ledger failure", async () => {
    const { reader, query } = setup([]);
    const failure = new LedgerError("INVARIANT_VIOLATED", "stored state is inconsistent");
    query.mockRejectedValue(failure);
    await expect(reader.listActiveHolds("wallet-a")).rejects.toBe(failure);
  });

  test("does not turn query failure into an empty wallet", async () => {
    const { reader, query } = setup([]);
    const failure = new Error("database unavailable");
    query.mockRejectedValue(failure);
    await expect(reader.listActiveHolds("wallet-a")).rejects.toBe(failure);
  });
});
