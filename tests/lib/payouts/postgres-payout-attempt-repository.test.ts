import { describe, expect, test, vi } from "vitest";
import { Money, PayoutAttempt } from "@/domain";
import type { SqlExecutor, SqlRow } from "@/lib/money/sql";
import { PostgresPayoutAttemptRepository } from "@/lib/payouts/postgres-payout-attempt-repository";

const now = new Date("2040-01-02T12:00:00Z");
const submission = { bookerId: "booker", sessionId: "session", idempotencyKey: "new-key" };
const destination = {
  payoutAccountId: "account", userId: "booker", providerAccountReference: "acct_1", bankAccountReference: "bank_1",
};
const line = { holdId: "hold", participationId: "participant", holdingAccountId: "platform", walletId: "wallet", amountCents: 100, kind: "RELEASE" };

function row(status = "REQUESTED"): SqlRow {
  return {
    payout_id: "payout", session_id: "session", payout_account_id: "account", amount_cents: "100",
    status, idempotency_key: "legacy-key", requested_at: now,
    completed_at: status === "COMPLETED" ? now : null,
    failed_at: status === "FAILED" ? now : null,
    failure_reason: status === "FAILED" ? "declined" : null,
    provider_reference: status === "COMPLETED" ? "tr_1" : null,
    destination, lines: [line],
  };
}

describe("payout request metadata", () => {
  test.each(["REQUESTED", "FAILED", "COMPLETED"])("hydrates legacy %s attempts without keys and retains their original metadata on save", async (status) => {
    const query = vi.fn<SqlExecutor["query"]>().mockResolvedValueOnce([row(status)]).mockResolvedValue([]);
    const repository = new PostgresPayoutAttemptRepository({ query: query as SqlExecutor["query"] }, submission);
    const attempt = await repository.get("payout");
    expect(attempt).not.toBeNull();
    expect(attempt).not.toHaveProperty("idempotencyKey");
    if (status === "REQUESTED") expect(attempt?.requestedIntent()).not.toHaveProperty("idempotencyKey");
    await repository.save(attempt!);
    expect(query.mock.calls[1]?.[1]?.[5]).toBe("legacy-key");
    expect(query.mock.calls[1]?.[0]).not.toContain("idempotency_key = excluded");
  });

  test("writes the real preparation key for a new attempt", async () => {
    const query = vi.fn<SqlExecutor["query"]>().mockResolvedValue([]);
    await new PostgresPayoutAttemptRepository({ query: query as SqlExecutor["query"] }, submission).save(newAttempt());
    expect(query.mock.calls[0]?.[1]?.[5]).toBe("new-key");
  });

  test("rejects saving a new attempt without private preparation metadata", async () => {
    const query = vi.fn<SqlExecutor["query"]>().mockResolvedValue([]);
    await expect(new PostgresPayoutAttemptRepository({ query: query as SqlExecutor["query"] }).save(newAttempt()))
      .rejects.toMatchObject({ name: "SessionPersistenceError" });
    expect(query).not.toHaveBeenCalled();
  });

  test("translates duplicate stored request keys through the existing application conflict mapping", async () => {
    const cause = { code: "23505", constraint: "payout_attempts_session_key_unique" };
    const query = vi.fn<SqlExecutor["query"]>().mockRejectedValue(cause);
    await expect(new PostgresPayoutAttemptRepository({ query: query as SqlExecutor["query"] }, submission).save(newAttempt()))
      .rejects.toMatchObject({ name: "LedgerError", code: "IDEMPOTENCY_CONFLICT", cause });
  });

  test.each([null, "", " "])("still rejects invalid legacy request metadata %j", async (key) => {
    const query = vi.fn<SqlExecutor["query"]>().mockResolvedValue([{ ...row(), idempotency_key: key }]);
    await expect(new PostgresPayoutAttemptRepository({ query: query as SqlExecutor["query"] }).get("payout"))
      .rejects.toMatchObject({ name: "SessionPersistenceError" });
  });
});

function newAttempt(): PayoutAttempt {
  return PayoutAttempt.create({
    payoutId: "payout", sessionId: "session", requestedAt: now, destination,
    lines: [{ holdId: "hold", participationId: "participant", holdingAccountId: "platform", walletId: "wallet", amount: Money.fromCents(100), kind: "RELEASE" }],
  });
}
