import type { Pool } from "pg";
import { expect, test, vi } from "vitest";
import { fingerprintOf } from "@/lib/money/idempotency";
import type { SqlRow } from "@/lib/money/sql";
import { PostgresPayoutUnitOfWork } from "@/lib/payouts/postgres-payout-unit-of-work";

const now = new Date("2040-01-02T12:00:00Z");
const submission = { bookerId: "booker", sessionId: "session", idempotencyKey: "legacy-key" };
const key = JSON.stringify(["UC1-08:prepare", "booker", "session", "legacy-key"]);

function scenario(responses: readonly SqlRow[][] = []) {
  const pending = [...responses];
  const query = vi.fn(async (statement: string): Promise<{ rows: readonly SqlRow[] }> => {
    if (/^begin|^commit|^rollback/.test(statement)) return { rows: [] };
    const rows = pending.shift();
    if (rows === undefined) throw new Error(`Unexpected query: ${statement}`);
    return { rows };
  });
  const pool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
  return { query, unit: new PostgresPayoutUnitOfWork(() => pool, { now: () => now }) };
}

test("replays a legacy preparation using the same key, fingerprint and response shape", async () => {
  const prepared = { kind: "REQUESTED", payoutId: "payout", sessionId: "session", amountCents: 500, accountReference: "acct_1" };
  const { query, unit } = scenario([[], [{ status: "SUCCEEDED", request_fingerprint: fingerprintOf(key), response: { value: prepared } }]]);
  const work = vi.fn(async () => { throw new Error("Preparation must not run during replay"); });
  expect(await unit.prepare(submission, work)).toEqual(prepared);
  expect(work).not.toHaveBeenCalled();
  expect(query.mock.calls[1]?.[0]).toContain("insert into idempotency_keys");
  expect(query.mock.calls[1]).toEqual(expect.arrayContaining([[key, "UC1-08:prepare", fingerprintOf(key)]]));
});

test("always runs step callbacks in fresh transactions even when the key repeats", async () => {
  const { query, unit } = scenario();
  const work = vi.fn(async () => work.mock.calls.length);
  expect(await unit.transaction('["UC1-08:complete","payout"]', work)).toBe(1);
  expect(await unit.transaction('["UC1-08:complete","payout"]', work)).toBe(2);
  expect(query.mock.calls.map(([statement]) => statement)).toEqual([
    "begin isolation level read committed", "commit", "begin isolation level read committed", "commit",
  ]);
});

test("rolls back preparation failure without marking the request successful", async () => {
  const { query, unit } = scenario([[{ idempotency_key: key }]]);
  const failure = new Error("Save failed");
  await expect(unit.prepare(submission, async () => { throw failure; })).rejects.toBe(failure);
  expect(query.mock.calls.map(([statement]) => statement)).toContain("rollback");
  expect(query.mock.calls.some(([statement]) => statement.includes("update idempotency_keys"))).toBe(false);
});
