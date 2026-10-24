import { expect, test, vi } from "vitest";
import { fingerprintOf } from "@/lib/money/idempotency";
import type { SqlExecutor } from "@/lib/money/sql";
import { PostgresPayoutReceipts } from "@/lib/payouts/postgres-payout-receipts";

const key = '["UC1-08:result","payout"]';
const recovery = { kind: "PAID", payoutId: "payout", amountCents: 500 } as const;
const stored = { status: "SUCCEEDED", scope: "UC1-08:result", request_fingerprint: fingerprintOf(key), response: { value: recovery } };

test("returns the existing immutable recovery receipt when a bank result arrives later", async () => {
  const query = vi.fn<SqlExecutor["query"]>().mockResolvedValueOnce([]).mockResolvedValueOnce([stored]);
  const receipts = new PostgresPayoutReceipts({ query: query as SqlExecutor["query"] });
  expect(await receipts.storeIfAbsent({ ...recovery, bankPayout: "INSTANT" })).toEqual(recovery);
  expect(query.mock.calls[0]?.[0]).toContain("on conflict (idempotency_key) do nothing");
  expect(query.mock.calls[0]?.[1]?.[0]).toBe(key);
  expect(query.mock.calls[0]?.[1]?.[1]).toBe(fingerprintOf(key));
  expect(query.mock.calls[1]?.[1]).toEqual([key]);
});

test("persists and reads the existing response envelope", async () => {
  const query = vi.fn<SqlExecutor["query"]>().mockResolvedValue([stored]);
  expect(await new PostgresPayoutReceipts({ query: query as SqlExecutor["query"] }).storeIfAbsent(recovery)).toEqual(recovery);
  expect(query.mock.calls[0]?.[1]?.[2]).toBe(JSON.stringify({ value: recovery }));
});

test("returns null for an absent receipt", async () => {
  const query = vi.fn<SqlExecutor["query"]>().mockResolvedValue([]);
  expect(await new PostgresPayoutReceipts({ query: query as SqlExecutor["query"] }).get("payout")).toBeNull();
});

test.each([
  { status: "IN_PROGRESS" },
  { scope: "UC1-08:prepare" },
  { request_fingerprint: "wrong" },
  { response: { value: { ...recovery, payoutId: "foreign" } } },
  { response: { value: { ...recovery, amountCents: 0 } } },
])("rejects corrupt stored receipts: %j", async (invalid) => {
  const query = vi.fn<SqlExecutor["query"]>().mockResolvedValue([{ ...stored, ...invalid }]);
  await expect(new PostgresPayoutReceipts({ query: query as SqlExecutor["query"] }).get("payout"))
    .rejects.toMatchObject({ name: "SessionPersistenceError" });
});
