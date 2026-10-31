import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { PayoutAttempt } from "@/domain";
import { PLATFORM_HOLDING_ACCOUNT_ID } from "@/lib/money/constants";
import { PostgresPayoutUnitOfWork } from "@/lib/payouts/postgres-payout-unit-of-work";
import { PayoutProviderError } from "@/use-cases/payouts/SetUpPayoutAccount";
import {
  PayoutDeclinedError,
  WithdrawSessionPayout,
  type PayoutSubmission,
  type PayoutUnitOfWork,
  type WithdrawalResult,
} from "@/use-cases/payouts/WithdrawSessionPayout";
import { sessionTestContext, type SessionTestContext } from "../support/session-test-context";

const startAt = new Date("2045-06-17T02:00:00Z");
const endAt = new Date("2045-06-17T03:00:00Z");
const now = new Date("2045-06-17T04:00:00Z");
const clock = { now: () => now };

describe("UC1-08 production payout persistence", () => {
  let context: SessionTestContext;
  beforeAll(() => { context = sessionTestContext(); });
  afterAll(async () => { await context?.pool.end(); });

  function unitOfWork() { return new PostgresPayoutUnitOfWork(() => context.pool, clock); }

  async function fixture(withPayableHolds = true) {
    const booker = await context.identity();
    const sessionId = randomUUID();
    await context.pool.query(
      `insert into sessions (session_id, booker_id, venue_name, region, sport, start_at, end_at,
        total_cost_cents, total_slots, booking_share_cents, visibility, status,
        room_token, holding_account_id)
       values ($1,$2,'Payout fixture','West','Badminton',$3,$4,1000,3,500,'PRIVATE','AWAITING_PAYOUT',$5,$6)`,
      [sessionId, booker.userId, startAt, endAt, randomUUID(), PLATFORM_HOLDING_ACCOUNT_ID],
    );
    for (const attendance of withPayableHolds ? ["ATTENDED", "ABSENT"] : []) {
      const participant = await context.identity(false);
      const participationId = randomUUID();
      const holdId = randomUUID();
      await context.pool.query(
        `insert into participations (participation_id,session_id,user_id,status,attendance,committed_at,verified_at,verification_method)
         values ($1,$2,$3,'COMMITTED',$4,$5,$6,'BOOKER')`,
        [participationId, sessionId, participant.userId, attendance, startAt, endAt],
      );
      await context.pool.query(
        `insert into fund_holds (hold_id,participation_id,holding_account_id,wallet_id,amount_cents,state,created_at)
         values ($1,$2,$3,$4,500,'HELD',$5)`,
        [holdId, participationId, PLATFORM_HOLDING_ACCOUNT_ID, participant.walletId, startAt],
      );
      await context.pool.query(
        `insert into ledger_entries (kind,amount_cents,occurred_at,idempotency_key,external_reference,wallet_id)
         values ('TOP_UP',500,$1,$2,$3,$4)`,
        [startAt, randomUUID(), randomUUID(), participant.walletId],
      );
      await context.pool.query(
        `insert into ledger_entries (kind,amount_cents,occurred_at,idempotency_key,wallet_id,hold_id,holding_account_id,session_id,participation_id)
         values ('LOCK',500,$1,$2,$3,$4,$5,$6,$7)`,
        [startAt, randomUUID(), participant.walletId, holdId, PLATFORM_HOLDING_ACCOUNT_ID, sessionId, participationId],
      );
    }
    const request = { bookerId: booker.userId, sessionId, idempotencyKey: randomUUID(), method: "INSTANT" as const };
    return { request };
  }

  function service(work: PayoutUnitOfWork = unitOfWork()) {
    const transfer = vi.fn(async ({ payoutId }: { payoutId: string }) => `tr_${payoutId}`);
    const instantPayout = vi.fn(async () => {});
    const getAccount = vi.fn(async (accountReference: string) => ({
      accountReference, payoutsEnabled: true, rejected: false,
      defaultDestinationReference: "bank", instantPayoutsAvailable: true,
    }));
    const withdraw = new WithdrawSessionPayout({
      unitOfWork: work, transfers: { transfer, instantPayout }, accounts: { getAccount },
      clock, ids: { next: randomUUID },
    });
    return { withdraw, transfer, instantPayout, getAccount };
  }

  async function state(sessionId: string) {
    const session = (await context.pool.query(
      "select status,pending_settlement,payout_attempt_ids,payout_idempotency_keys from sessions where session_id=$1", [sessionId],
    )).rows[0];
    const attempts = (await context.pool.query(
      "select * from payout_attempts where session_id=$1 order by requested_at,payout_id", [sessionId],
    )).rows;
    const ledger = (await context.pool.query(
      "select * from ledger_entries where session_id=$1 order by entry_id", [sessionId],
    )).rows;
    const holds = (await context.pool.query(
      `select h.* from fund_holds h join participations p using (participation_id)
       where p.session_id=$1 order by h.hold_id`, [sessionId],
    )).rows;
    const holdBalances = (await context.pool.query(
      "select * from hold_balances where session_id=$1 order by hold_id", [sessionId],
    )).rows;
    const walletBalances = (await context.pool.query(
      `select b.* from wallet_balances b join wallets w using (wallet_id)
       where w.user_id in (
         select user_id from participations where session_id=$1
         union select booker_id from sessions where session_id=$1
       ) order by b.wallet_id`, [sessionId],
    )).rows;
    const payables = (await context.pool.query(
      "select * from payout_payables where session_id=$1 order by payout_id", [sessionId],
    )).rows;
    return { session, attempts, ledger, holds, holdBalances, walletBalances, payables };
  }

  async function receipt(payoutId: string) {
    return (await context.pool.query(
      "select response from idempotency_keys where idempotency_key=$1", [JSON.stringify(["UC1-08:result", payoutId])],
    )).rows;
  }

  async function seedLegacyPreparation(submission: PayoutSubmission, payoutId: string, accountReference: string) {
    const key = JSON.stringify(["UC1-08:prepare", submission.bookerId, submission.sessionId, submission.idempotencyKey]);
    const prepared = { kind: "REQUESTED", payoutId, sessionId: submission.sessionId, amountCents: 1000, accountReference };
    // Pre-refactor fingerprintOf(string) hashes the JSON encoding of the key.
    // Keep this oracle independent of the current adapter's key derivation.
    const fingerprint = createHash("sha256").update(JSON.stringify(key)).digest("hex");
    await context.pool.query(
      `insert into idempotency_keys (idempotency_key,scope,request_fingerprint,status,response,completed_at)
       values ($1,'UC1-08:prepare',$2,'SUCCEEDED',$3::jsonb,now())`,
      [key, fingerprint, JSON.stringify({ value: prepared })],
    );
    return prepared;
  }

  test("nothing-to-pay preparation replays without an attempt, key history or financial effects", async () => {
    const { request } = await fixture(false);
    const before = await state(request.sessionId);
    const first = service();

    expect(await first.withdraw.forBooker(request)).toEqual({ kind: "NOTHING_TO_PAY" });
    const after = await state(request.sessionId);
    expect(after).toEqual({ ...before, session: { ...before.session, status: "SETTLED" } });
    expect(after.attempts).toEqual([]);
    expect(after.session.payout_attempt_ids).toEqual([]);
    expect(after.session.payout_idempotency_keys).toEqual([]);
    expect(first.transfer).not.toHaveBeenCalled();
    expect(first.getAccount).not.toHaveBeenCalled();
    expect(first.instantPayout).not.toHaveBeenCalled();
    const retry = service();
    expect(await retry.withdraw.forBooker(request)).toEqual({ kind: "NOTHING_TO_PAY" });
    expect(await state(request.sessionId)).toEqual(after);
    expect(retry.transfer).not.toHaveBeenCalled();
    expect(retry.getAccount).not.toHaveBeenCalled();
    expect(retry.instantPayout).not.toHaveBeenCalled();
  });

  test("reconstructed dependencies replay a paid request without any provider or ledger effects", async () => {
    const { request } = await fixture();
    const first = service();
    const paid = await first.withdraw.forBooker(request);
    const before = await state(request.sessionId);
    const retry = service();

    expect(await retry.withdraw.forBooker(request)).toEqual(paid);
    expect(retry.transfer).not.toHaveBeenCalled();
    expect(retry.getAccount).not.toHaveBeenCalled();
    expect(retry.instantPayout).not.toHaveBeenCalled();
    expect(await state(request.sessionId)).toEqual(before);
    expect(before.attempts).toHaveLength(1);
    expect(before.ledger.map((entry) => entry.kind).sort()).toEqual(["FORFEIT", "LOCK", "LOCK", "PAYOUT", "RELEASE"]);
    expect(before.holds.map((hold) => hold.state).sort()).toEqual(["FORFEITED", "RELEASED"]);
    expect(before.holdBalances.map((hold) => Number(hold.held_cents))).toEqual([0, 0]);
    expect(before.payables).toMatchObject([{ payable_cents: "0", paid_out_cents: "1000" }]);
    expect(before.session.payout_idempotency_keys).toEqual([request.idempotencyKey]);
    expect(before.attempts[0].idempotency_key).toBe(request.idempotencyKey);
  });

  test("declined replay is durable and a new key creates a new attempt", async () => {
    const { request } = await fixture();
    const first = service();
    first.transfer.mockRejectedValueOnce(new PayoutDeclinedError("balance_insufficient"));
    const declined = await first.withdraw.forBooker(request);
    const before = await state(request.sessionId);
    const retry = service();

    expect(await retry.withdraw.forBooker(request)).toEqual(declined);
    expect(retry.transfer).not.toHaveBeenCalled();
    expect(retry.getAccount).not.toHaveBeenCalled();
    expect(await state(request.sessionId)).toEqual(before);
    const nextKey = randomUUID();
    expect(await retry.withdraw.forBooker({ ...request, idempotencyKey: nextKey })).toMatchObject({ kind: "PAID" });
    const after = await state(request.sessionId);
    expect(after.attempts.map((attempt) => attempt.status).sort()).toEqual(["COMPLETED", "FAILED"]);
    expect(after.session.payout_idempotency_keys).toEqual([request.idempotencyKey, nextKey]);
    expect(after.ledger.filter((entry) => entry.kind === "PAYOUT")).toHaveLength(1);
  });

  test("legacy pending metadata hydrates without keys and survives a resume under a different request key", async () => {
    const { request } = await fixture();
    const first = service();
    first.transfer.mockRejectedValueOnce(new PayoutProviderError("Response lost"));
    await expect(first.withdraw.forBooker(request)).rejects.toThrow("Response lost");
    const before = await state(request.sessionId);
    const payoutId = before.attempts[0].payout_id;
    const legacyRequest = { ...request, idempotencyKey: randomUUID() };
    const prepared = await seedLegacyPreparation(legacyRequest, payoutId, before.attempts[0].destination.providerAccountReference);
    const replayWork = vi.fn(async () => { throw new Error("Legacy preparation must replay"); });
    expect(await unitOfWork().prepare(legacyRequest, replayWork)).toEqual(prepared);
    expect(replayWork).not.toHaveBeenCalled();
    await unitOfWork().transaction("inspect-pending", async ({ sessions, payouts }) => {
      const session = await sessions.get(request.sessionId);
      const attempt = await payouts.get(payoutId);
      expect(session).not.toHaveProperty("payoutIdempotencyKeys");
      expect(session?.pendingSettlement).not.toHaveProperty("idempotencyKey");
      expect(attempt).not.toHaveProperty("idempotencyKey");
      if (!session || !attempt) throw new Error("Fixture missing");
      await sessions.save(session);
      await payouts.save(attempt);
    });
    expect(await state(request.sessionId)).toEqual(before);
    const retry = service();
    await retry.withdraw.forBooker(legacyRequest);
    const after = await state(request.sessionId);
    expect(after.attempts).toHaveLength(1);
    expect(after.attempts[0].payout_id).toBe(payoutId);
    expect(after.attempts[0].idempotency_key).toBe(request.idempotencyKey);
    expect(after.session.payout_idempotency_keys).toEqual([request.idempotencyKey]);
  });

  test.each(["COMPLETED", "FAILED"])("legacy %s attempts recover a receipt without dispatch and preserve metadata", async (status) => {
    const { request } = await fixture();
    const first = service();
    if (status === "FAILED") first.transfer.mockRejectedValueOnce(new PayoutDeclinedError("declined"));
    const original = await first.withdraw.forBooker(request);
    if (original.kind === "NOTHING_TO_PAY") throw new Error("Expected payable fixture");
    // A pre-refactor preparation has the same namespace/envelope but no terminal receipt.
    await context.pool.query("delete from idempotency_keys where idempotency_key=$1", [JSON.stringify(["UC1-08:result", original.payoutId])]);
    const before = await state(request.sessionId);
    const legacyRequest = { ...request, idempotencyKey: randomUUID() };
    await seedLegacyPreparation(legacyRequest, original.payoutId, before.attempts[0].destination.providerAccountReference);
    const retry = service();
    const recovered = await retry.withdraw.forBooker(legacyRequest);

    expect(recovered).toEqual(status === "COMPLETED"
      ? { kind: "PAID", payoutId: original.payoutId, amountCents: 1000 }
      : original);
    expect(retry.transfer).not.toHaveBeenCalled();
    expect(retry.getAccount).not.toHaveBeenCalled();
    expect(await receipt(original.payoutId)).toEqual([{ response: { value: recovered } }]);
    await unitOfWork().transaction("inspect-terminal", async ({ sessions, payouts }) => {
      const session = await sessions.get(request.sessionId);
      const attempt = await payouts.get(original.payoutId);
      expect(session).not.toHaveProperty("payoutIdempotencyKeys");
      expect(attempt).not.toHaveProperty("idempotencyKey");
      if (!session || !attempt) throw new Error("Fixture missing");
      await sessions.save(session);
      await payouts.save(attempt);
    });
    expect(await state(request.sessionId)).toEqual(before);
  });

  test.each(["same", "different"])("concurrent %s-key requests share one attempt, settlement and immutable receipt", async (keys) => {
    const { request } = await fixture();
    const bothDispatched = gate();
    const releaseTransfers = gate();
    const first = service();
    let arrivals = 0;
    first.transfer.mockImplementation(async ({ payoutId }) => {
      if (++arrivals === 2) bothDispatched.open();
      await releaseTransfers.promise;
      return `tr_${payoutId}`;
    });
    const one = first.withdraw.forBooker(request);
    const two = first.withdraw.forBooker({ ...request, idempotencyKey: keys === "same" ? request.idempotencyKey : randomUUID() });
    const completed = Promise.all([one, two]);
    void completed.catch(() => {});
    try {
      await waitFor(bothDispatched.promise);
      expect((await state(request.sessionId)).attempts).toHaveLength(1);
    } finally {
      releaseTransfers.open();
      await Promise.allSettled([one, two]);
    }
    const results = await completed;
    expect(results[0]).toEqual(results[1]);
    const after = await state(request.sessionId);
    expect(after.attempts).toHaveLength(1);
    expect(after.ledger.map((entry) => entry.kind).sort()).toEqual(["FORFEIT", "LOCK", "LOCK", "PAYOUT", "RELEASE"]);
    expect(after.holds.map((hold) => hold.state).sort()).toEqual(["FORFEITED", "RELEASED"]);
    expect(after.holdBalances.map((hold) => [Number(hold.held_cents), hold.settled_kind]).sort())
      .toEqual([[0, "FORFEIT"], [0, "RELEASE"]]);
    expect(after.payables).toMatchObject([{ payable_cents: "0", paid_out_cents: "1000" }]);
    expect(first.instantPayout.mock.calls.length).toBeLessThanOrEqual(1);
    expect(await receipt(after.attempts[0].payout_id)).toEqual([{ response: { value: results[0] } }]);
  });

  test("a recovery receipt wins while the completion winner is paused before its bank payout", async () => {
    const { request } = await fixture();
    const atBankStep = gate();
    const releaseBank = gate();
    const first = service();
    first.getAccount.mockImplementation(async (accountReference) => {
      atBankStep.open();
      await releaseBank.promise;
      return { accountReference, payoutsEnabled: true, rejected: false, defaultDestinationReference: "bank", instantPayoutsAvailable: true };
    });
    const winner = first.withdraw.forBooker(request);
    void winner.catch(() => {});
    let recovered: WithdrawalResult;
    try {
      await waitFor(atBankStep.promise);
      const retry = service();
      recovered = await retry.withdraw.forBooker(request);
      expect(retry.transfer).not.toHaveBeenCalled();
      expect(retry.instantPayout).not.toHaveBeenCalled();
      expect(recovered).not.toHaveProperty("bankPayout");
    } finally {
      releaseBank.open();
      await Promise.allSettled([winner]);
    }
    expect(await winner).toEqual(recovered);
    expect(first.instantPayout).toHaveBeenCalledTimes(1);
    const after = await state(request.sessionId);
    expect(await receipt(after.attempts[0].payout_id)).toEqual([{ response: { value: recovered } }]);
    expect(await service().withdraw.forBooker(request)).toEqual(recovered);
  });

  test("preparation rollback removes the request claim, attempt and session changes", async () => {
    const { request } = await fixture();
    const before = await state(request.sessionId);
    await expect(unitOfWork().prepare(request, async ({ users, sessions, payouts }) => {
      const user = await users.get(request.bookerId);
      const session = await sessions.get(request.sessionId);
      if (!user || !session) throw new Error("Fixture missing");
      const batch = user.asBooker().preparePayout(session, { payoutId: randomUUID(), now });
      if (!batch) throw new Error("Fixture should be payable");
      await sessions.save(session);
      await payouts.save(PayoutAttempt.create(batch));
      throw new Error("Rollback after preparation");
    })).rejects.toThrow("Rollback after preparation");
    expect(await state(request.sessionId)).toEqual(before);
    expect((await context.pool.query("select 1 from idempotency_keys where idempotency_key=$1", [
      JSON.stringify(["UC1-08:prepare", request.bookerId, request.sessionId, request.idempotencyKey]),
    ])).rows).toEqual([]);
    expect(await service().withdraw.forBooker(request)).toMatchObject({ kind: "PAID" });
  });

  test("completion rollback removes every financial effect and the next invocation executes fresh work", async () => {
    const { request } = await fixture();
    const before = await state(request.sessionId);
    const base = unitOfWork();
    const failing: PayoutUnitOfWork = {
      prepare: (submission, work) => base.prepare(submission, work),
      transaction: (key, work) => base.transaction(key, async (transaction) => {
        const result = await work(transaction);
        if (JSON.parse(key)[0] === "UC1-08:complete") throw new Error("Rollback after completion");
        return result;
      }),
    };
    await expect(service(failing).withdraw.forBooker(request)).rejects.toThrow("Rollback after completion");
    const failed = await state(request.sessionId);
    expect(failed.session.status).toBe("PAYOUT_PENDING");
    expect(failed.attempts[0].status).toBe("REQUESTED");
    expect(failed.ledger.map((entry) => entry.kind)).toEqual(["LOCK", "LOCK"]);
    expect(failed.holds).toEqual(before.holds);
    expect(failed.holdBalances).toEqual(before.holdBalances);
    expect(failed.walletBalances).toEqual(before.walletBalances);
    expect(failed.payables).toEqual(before.payables);
    expect(await receipt(failed.attempts[0].payout_id)).toEqual([]);
    expect(await service().withdraw.forBooker(request)).toMatchObject({ kind: "PAID" });
    expect((await state(request.sessionId)).ledger.filter((entry) => entry.kind === "PAYOUT")).toHaveLength(1);
  });
});

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => { open = resolve; });
  return { promise, open };
}

/** A failed invocation must release its peer instead of leaving an open test gate. */
async function waitFor(promise: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Payout did not reach the expected gate")), 5000);
    })]);
  } finally { clearTimeout(timer); }
}
