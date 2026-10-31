import { expect, test, vi } from "vitest";
import { Money, type PayoutBatch } from "@/domain";
import type { SqlExecutor, SqlRow } from "@/lib/money/sql";
import { PostgresPayoutSessionRepository } from "@/lib/payouts/postgres-payout-session-repository";

const now = new Date("2040-01-02T12:00:00Z");
const startAt = new Date("2040-01-02T10:00:00Z");
const batch: PayoutBatch = {
  payoutId: "payout", sessionId: "session", requestedAt: now,
  destination: { payoutAccountId: "account", userId: "booker", providerAccountReference: "provider", bankAccountReference: "bank" },
  lines: [{ holdId: "hold", participationId: "participant", holdingAccountId: "platform", walletId: "wallet", amount: Money.fromCents(100), kind: "RELEASE" }],
};
const storedBatch = {
  payoutId: "payout", sessionId: "session", idempotencyKey: "original-key", requestedAt: now.toISOString(),
  destination: batch.destination,
  lines: [{ holdId: "hold", participationId: "participant", holdingAccountId: "platform", walletId: "wallet", amountCents: 100, kind: "RELEASE" }],
};
const participant: SqlRow = {
  session_id: "session", participation_id: "participant", user_id: "player", status: "COMMITTED", attendance: "ATTENDED",
  waitlisted_at: null, committed_at: startAt, withdrawn_at: null, replacement_mode: null, replacement_invitee_id: null,
  verified_at: now, verification_method: "BOOKER", replaces_participation_id: null, queue_sequence: null,
  participant_wallet_id: "wallet", hold_id: "hold", hold_participation_id: "participant", holding_account_id: "platform",
  wallet_id: "wallet", payout_id: null, amount_cents: "100", hold_state: "HELD", hold_created_at: startAt, settled_at: null,
};

function scenario(overrides: SqlRow = {}, participants = [participant], requestKey = "new-key") {
  const row: SqlRow = {
    session_id: "session", booker_id: "booker", venue_name: "Court", region: "West", sport: "Tennis",
    start_at: startAt, end_at: now, total_cost_cents: "200", total_slots: 2,
    booking_share_cents: "100", visibility: "PUBLIC", status: "PAYOUT_PENDING", minimum_reliability: null,
    room_token: "room", holding_account_id: "platform", invited_group_id: null, next_queue_sequence: 1,
    payout_attempt_ids: ["payout"], payout_idempotency_keys: ["original-key"], pending_settlement: storedBatch,
    ...overrides,
  };
  const query = vi.fn<(statement: string, values?: readonly unknown[]) => Promise<readonly SqlRow[]>>(async (statement) => {
    if (statement.includes("from sessions")) return [row];
    if (statement.includes("from participations")) return participants;
    if (statement.includes("update sessions")) return [{ session_id: "session" }];
    if (statement.includes("update participations")) return [{ participation_id: "participant" }];
    if (statement.includes("update fund_holds")) return [{ hold_id: "hold" }];
    throw new Error(`Unexpected query: ${statement}`);
  });
  const repository = new PostgresPayoutSessionRepository({ query: query as SqlExecutor["query"] }, {
    bookerId: "booker", sessionId: "session", idempotencyKey: requestKey,
  });
  return { query, repository };
}

test("resaving a legacy pending batch preserves its original request metadata", async () => {
  const { query, repository } = scenario();
  const session = await repository.get("session");
  expect(session?.pendingSettlement).not.toHaveProperty("idempotencyKey");
  await repository.save(session!);
  const values = query.mock.calls.find(([statement]) => statement.includes("update sessions"))?.[1];
  expect(JSON.parse(String(values?.[2]))).toEqual(storedBatch);
  expect(values?.[4]).toEqual(["original-key"]);
});

test.each(["complete", "fail"])("%s preserves legacy request history while clearing pending metadata", async (transition) => {
  const { query, repository } = scenario();
  const session = (await repository.get("session"))!;
  if (transition === "complete") session.completeSettlement("payout", now);
  else session.failSettlement("payout", now);
  await repository.save(session);
  const values = query.mock.calls.find(([statement]) => statement.includes("update sessions"))?.[1];
  expect(values?.[2]).toBeNull();
  expect(values?.[4]).toEqual(["original-key"]);
});

test("new payable preparation writes its real key alongside prior metadata", async () => {
  const { query, repository } = scenario({ status: "AWAITING_PAYOUT", pending_settlement: null, payout_attempt_ids: ["old-payout"] });
  const session = (await repository.get("session"))!;
  session.recordSettlementPreparation({ payoutId: "payout", batch, participations: session.participantList.participations }, now);
  await repository.save(session);
  const values = query.mock.calls.find(([statement]) => statement.includes("update sessions"))?.[1];
  expect(JSON.parse(String(values?.[2])).idempotencyKey).toBe("new-key");
  expect(values?.[4]).toEqual(["original-key", "new-key"]);
});

test("rejects a historically used key before writing any financial changes", async () => {
  const { query, repository } = scenario({ status: "AWAITING_PAYOUT", pending_settlement: null, payout_attempt_ids: ["old-payout"] }, [participant], "original-key");
  const session = (await repository.get("session"))!;
  session.recordSettlementPreparation({ payoutId: "payout", batch, participations: session.participantList.participations }, now);
  await expect(repository.save(session)).rejects.toMatchObject({ name: "LedgerError", code: "IDEMPOTENCY_CONFLICT" });
  expect(query.mock.calls.some(([statement]) => /^\s*update/.test(statement))).toBe(false);
});

test("nothing-to-pay adds neither an attempt nor request-key history", async () => {
  const { query, repository } = scenario({ status: "AWAITING_PAYOUT", pending_settlement: null, payout_attempt_ids: [] }, []);
  const session = (await repository.get("session"))!;
  session.recordSettlementPreparation({ payoutId: "unused", participations: [] }, now);
  await repository.save(session);
  const values = query.mock.calls.find(([statement]) => statement.includes("update sessions"))?.[1];
  expect(values?.[2]).toBeNull();
  expect(values?.[3]).toEqual([]);
  expect(values?.[4]).toEqual(["original-key"]);
});
