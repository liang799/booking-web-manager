import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Money, PayoutAttempt } from "@/domain";
import { PostgresTransactor } from "@/lib/database/postgres-transactor";
import { PLATFORM_HOLDING_ACCOUNT_ID } from "@/lib/money/constants";
import { PostgresLedgerWriter } from "@/lib/money/ledger-write-adapter";
import { PostgresPayoutAttemptRepository } from "@/lib/payouts/postgres-payout-attempt-repository";
import { PostgresWalletReader } from "@/lib/wallet/postgres-wallet-reader";
import { GetWalletSummary } from "@/use-cases/wallet/GetWalletSummary";
import { ListWalletTransactions } from "@/use-cases/wallet/ListWalletTransactions";
import { cancellationFixture, cancellationSql } from "../support/cancellation-fixtures";
import { sessionTestContext, type SessionTestContext } from "../support/session-test-context";

describe("UC1-05 PostgreSQL wallet projections", () => {
  let context: SessionTestContext;
  beforeAll(() => { context = sessionTestContext(); });
  afterAll(async () => { await context?.pool.end(); });

  function summary(userId: string) {
    return new PostgresTransactor(context.pool).transaction((sql) =>
      new GetWalletSummary(new PostgresWalletReader(sql)).forUser(userId),
    );
  }

  function history(userId: string, limit: number, before?: Date) {
    return new PostgresTransactor(context.pool).transaction((sql) =>
      new ListWalletTransactions(new PostgresWalletReader(sql)).forUser(userId, { limit, before }),
    );
  }

  test("enriches a nonempty wallet page without dropping top-ups, changing continuation or leaking another wallet", async () => {
    const fixture = await cancellationFixture(context, 2);
    const [participant, other] = fixture.participants;
    if (!participant || !other) throw new Error("Fixture needs two participants");
    const older = new Date("2090-01-01T00:00:00Z");
    const newer = new Date("2091-01-01T00:00:00Z");
    await new PostgresTransactor(context.pool).transaction(async (sql) => {
      const writer = new PostgresLedgerWriter(sql, randomUUID());
      for (const [walletId, amountCents, occurredAt] of [
        [participant.walletId, 1000, older],
        [participant.walletId, 2000, newer],
        [other.walletId, 9000, new Date("2092-01-01T00:00:00Z")],
      ] as const) {
        await writer.creditTopUp({
          walletId, amount: Money.fromCents(amountCents), occurredAt, externalReference: randomUUID(),
        });
      }
    });

    const first = await history(participant.userId, 2);
    expect(first.items.map(({ kind, amountCents, sport, occurredAt }) => ({ kind, amountCents, sport, occurredAt })))
      .toEqual([
        { kind: "TOP_UP", amountCents: 2000, sport: undefined, occurredAt: newer },
        { kind: "TOP_UP", amountCents: 1000, sport: undefined, occurredAt: older },
      ]);
    expect(first.nextCursor).toEqual(older);

    const next = await history(participant.userId, 3, first.nextCursor!);
    expect(next.items.map(({ kind, amountCents, sport, holdId }) => ({ kind, amountCents, sport, holdId })))
      .toEqual([
        { kind: "LOCK", amountCents: 500, sport: "Badminton", holdId: participant.holdId },
        { kind: "TOP_UP", amountCents: 500, sport: undefined, holdId: null },
      ]);
    expect(next.nextCursor).toBeNull();
    expect(new Set([...first.items, ...next.items].map((item) => item.transactionId)).size).toBe(4);
    expect(await summary(participant.userId)).toMatchObject({
      availableBalanceCents: 3000, heldBalanceCents: 500, pendingPayoutCents: 0,
      activeHolds: [{ holdId: participant.holdId, sport: "Badminton", heldCents: 500 }],
    });
    expect(await history(fixture.booker.userId, 2)).toEqual({ items: [], nextCursor: null });
  });

  async function insertSession(bookerId: string) {
    const sessionId = randomUUID();
    await context.pool.query(
      `insert into sessions(session_id,booker_id,venue_name,region,sport,start_at,end_at,total_cost_cents,
        total_slots,booking_share_cents,visibility,room_token,holding_account_id)
       values ($1,$2,'Wallet payout fixture','West','Badminton','2045-04-02T10:00:00Z',
        '2045-04-02T12:00:00Z',1000,3,500,'PUBLIC',$3,$4)`,
      [sessionId, bookerId, randomUUID(), PLATFORM_HOLDING_ACCOUNT_ID],
    );
    return sessionId;
  }

  test("identifies holds for sessions the wallet owner booked", async () => {
    const fixture = await cancellationFixture(context, 1);
    const participant = fixture.participants[0]!;
    expect((await summary(participant.userId)).activeHolds).toMatchObject([{ isBooker: false }]);

    await context.pool.query("update sessions set booker_id = $1 where session_id = $2", [participant.userId, fixture.sessionId]);

    expect((await summary(participant.userId)).activeHolds).toMatchObject([{ isBooker: true }]);
  });

  async function saveAttempt(userId: string, sessionId: string, amountCents: number) {
    const attempt = PayoutAttempt.create({
      payoutId: randomUUID(), sessionId,
      requestedAt: new Date("2045-04-03T00:00:00Z"),
      destination: {
        payoutAccountId: randomUUID(), userId,
        providerAccountReference: `provider-${randomUUID()}`, bankAccountReference: `bank-${randomUUID()}`,
      },
      // Payout attempts retain their own frozen settlement snapshot; the reader
      // must aggregate this amount without requiring live hold or payable rows.
      lines: [{
        holdId: randomUUID(), participationId: randomUUID(), walletId: randomUUID(),
        holdingAccountId: PLATFORM_HOLDING_ACCOUNT_ID, amount: Money.fromCents(amountCents), kind: "RELEASE",
      }],
    });
    await new PostgresPayoutAttemptRepository(cancellationSql(context), {
      bookerId: userId, sessionId, idempotencyKey: randomUUID(),
    }).save(attempt);
    return attempt;
  }

  test("sums only this booker's requested payouts and removes completed or failed attempts from pending funds", async () => {
    const booker = await context.identity(false);
    const other = await context.identity(false);
    expect((await summary(booker.userId)).pendingPayoutCents).toBe(0);
    const firstSession = await insertSession(booker.userId);
    const secondSession = await insertSession(booker.userId);
    const completedSession = await insertSession(booker.userId);
    const otherSession = await insertSession(other.userId);
    const repository = new PostgresPayoutAttemptRepository(cancellationSql(context));
    async function load(attempt: PayoutAttempt) {
      const stored = await repository.get(attempt.payoutId);
      if (!stored) throw new Error("Payout fixture missing");
      return stored;
    }

    const failed = await load(await saveAttempt(booker.userId, firstSession, 999));
    failed.fail("Provider rejected the transfer", new Date("2045-04-03T01:00:00Z"));
    await repository.save(failed);
    const first = await load(await saveAttempt(booker.userId, firstSession, 1250));
    const second = await load(await saveAttempt(booker.userId, secondSession, 600));
    const completed = await load(await saveAttempt(booker.userId, completedSession, 888));
    completed.complete(`transfer-${randomUUID()}`, new Date("2045-04-03T01:00:00Z"));
    await repository.save(completed);
    await saveAttempt(other.userId, otherSession, 9000);

    expect(await summary(booker.userId)).toMatchObject({
      pendingPayoutCents: 1850, availableBalanceCents: 0, heldBalanceCents: 0,
    });
    expect((await summary(other.userId)).pendingPayoutCents).toBe(9000);

    first.complete(`transfer-${randomUUID()}`, new Date("2045-04-03T02:00:00Z"));
    await repository.save(first);
    expect((await summary(booker.userId)).pendingPayoutCents).toBe(600);
    second.fail("Provider rejected the transfer", new Date("2045-04-03T02:00:00Z"));
    await repository.save(second);
    expect((await summary(booker.userId)).pendingPayoutCents).toBe(0);
  });
});
