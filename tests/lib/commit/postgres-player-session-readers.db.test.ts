import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { Money, type UUID } from "@/domain";
import { NoDeliveryNotifier } from "@/lib/commit/no-delivery-notifier";
import { PostgresJoinedSessionsReader } from "@/lib/commit/postgres-joined-sessions-reader";
import { PostgresReplacementInvitationsReader } from "@/lib/commit/postgres-replacement-invitations-reader";
import { PostgresTransactor } from "@/lib/database/postgres-transactor";
import { PostgresLedgerWriter } from "@/lib/money/ledger-write-adapter";
import type { SqlExecutor } from "@/lib/money/sql";
import { PostgresCommitmentUnitOfWork } from "@/lib/sessions/postgres-commitment-unit-of-work";
import { AcceptReplacement } from "@/use-cases/sessions/AcceptReplacement";
import { CommitToSession } from "@/use-cases/sessions/CommitToSession";
import { LeaveWaitlist } from "@/use-cases/sessions/LeaveWaitlist";
import { PromoteFromWaitlist } from "@/use-cases/sessions/PromoteFromWaitlist";
import { type ReplacementChoice, WithdrawFromSession } from "@/use-cases/sessions/WithdrawFromSession";

/**
 * Reads the player's joined sessions and replacement invitations from a real,
 * fully migrated database, after driving the production commitment workflows.
 *
 * Skipped unless `COMMITMENT_TEST_DATABASE_URL` points at a throwaway
 * database, for example a local Supabase stack:
 *
 *   COMMITMENT_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
 *     npx vitest run --project unit tests/lib/commit/postgres-player-session-readers.db.test.ts
 *
 * The suite inserts its own users and sessions and never deletes; each test
 * uses fresh users, so other data in the database never appears in its lists.
 */
const DATABASE_URL = process.env.COMMITMENT_TEST_DATABASE_URL;
const SHARE_CENTS = 500;
const HOUR = 3_600_000;
const startsAt = new Date(Date.now() + 7 * 24 * HOUR);
const endsAt = new Date(startsAt.getTime() + 2 * HOUR);
const beforeStart = (hours: number) => new Date(startsAt.getTime() - hours * HOUR);

describe.skipIf(!DATABASE_URL)("player session lists (database)", () => {
  let pool: Pool;
  let sql: SqlExecutor;
  let holdingAccountId: UUID;
  let now = beforeStart(48);
  const clock = { now: () => now };
  const ids = { next: randomUUID };
  const notifier = new NoDeliveryNotifier();

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
    sql = { query: async (text, values) => (await pool.query(text, values ? [...values] : undefined)).rows };
    const rows = await pool.query(
      "insert into holding_accounts (label) values ($1) returning account_id",
      [`player-lists-test-${randomUUID()}`],
    );
    holdingAccountId = rows.rows[0].account_id;
  });
  afterAll(async () => pool?.end());
  beforeEach(() => {
    now = beforeStart(48);
  });

  describe("joined sessions", () => {
    test("lists each player's own committed and waitlisted places with the stored share", async () => {
      const [booker, alice = "", bob = "", carol = "", dave = ""] = await createUsers(5);
      const sessionId = await createSession(booker);
      await commit(alice, sessionId);
      await commit(bob, sessionId);
      await commit(carol, sessionId);

      expect(await joined(alice)).toEqual([expect.objectContaining({
        sessionId, venueName: "Court", sport: "Badminton", region: "North",
        startAt: startsAt, endAt: endsAt, status: "COMMITTED", bookingShareCents: SHARE_CENTS,
      })]);
      expect(await joined(carol)).toEqual([expect.objectContaining({ sessionId, status: "WAITLISTED" })]);
      expect(await joined(dave)).toEqual([]);
      expect(await joined(booker)).toEqual([]);
    });

    test("orders places by start time", async () => {
      const [booker, alice = ""] = await createUsers(2);
      const later = await createSession(booker, 24);
      const earlier = await createSession(booker);
      await commit(alice, later);
      await commit(alice, earlier);

      expect((await joined(alice)).map((session) => session.sessionId)).toEqual([earlier, later]);
    });

    test("drops a place once the player withdraws or leaves the waitlist", async () => {
      const [booker, alice = "", bob = "", carol = ""] = await createUsers(4);
      const sessionId = await createSession(booker);
      await commit(alice, sessionId);
      await commit(bob, sessionId);
      await commit(carol, sessionId);

      // Leave first: alice's withdrawal would otherwise promote carol.
      await leaveWaitlist(carol, sessionId);
      await withdraw(alice, sessionId);

      expect(await joined(alice)).toEqual([]);
      expect(await joined(carol)).toEqual([]);
      expect(await joined(bob)).toHaveLength(1);
    });

    test("leaves out sessions that have started or are no longer open", async () => {
      const [booker, alice = ""] = await createUsers(2);
      const started = await createSession(booker);
      const cancelled = await createSession(booker, 1);
      await commit(alice, started);
      await commit(alice, cancelled);
      await pool.query("update sessions set status = 'CANCELLED' where session_id = $1", [cancelled]);

      expect((await joined(alice)).map((session) => session.sessionId)).toEqual([started]);
      expect(await joined(alice, startsAt)).toEqual([]);
    });
  });

  describe("replacement invitations", () => {
    test("lists a late named withdrawal's place for the invitee only", async () => {
      const [booker, alice = "", bob = "", dave = ""] = await createUsers(4);
      const sessionId = await createSession(booker);
      await commit(alice, sessionId);
      await commit(bob, sessionId);
      now = beforeStart(10);

      await withdraw(alice, sessionId, { mode: "DIRECT_INVITE", inviteeId: dave });

      expect(await invitations(dave)).toEqual([{
        sessionId, venueName: "Court", sport: "Badminton", region: "North",
        startAt: startsAt, endAt: endsAt, bookingShareCents: SHARE_CENTS,
      }]);
      expect(await invitations(alice)).toEqual([]);
      expect(await invitations(bob)).toEqual([]);
    });

    test("lists an early named withdrawal's reserved place, whose share was already refunded", async () => {
      const [booker, alice = "", dave = ""] = await createUsers(3);
      const sessionId = await createSession(booker);
      await commit(alice, sessionId);
      now = beforeStart(40);

      await withdraw(alice, sessionId, { mode: "DIRECT_INVITE", inviteeId: dave });

      expect(await invitations(dave)).toEqual([expect.objectContaining({ sessionId })]);
    });

    test("drops the invitation once the invitee accepts, and lists the new place as joined", async () => {
      const [booker, alice = "", dave = ""] = await createUsers(3);
      const sessionId = await createSession(booker);
      await commit(alice, sessionId);
      now = beforeStart(10);
      await withdraw(alice, sessionId, { mode: "DIRECT_INVITE", inviteeId: dave });

      await new AcceptReplacement({ unitOfWork: unitOfWork(), clock, ids }).forInvitee({
        userId: dave,
        sessionId,
        idempotencyKey: randomUUID(),
      });

      expect(await invitations(dave)).toEqual([]);
      expect(await joined(dave)).toEqual([expect.objectContaining({ sessionId, status: "COMMITTED" })]);
    });

    test("an open-slot withdrawal invites nobody", async () => {
      const [booker, alice = "", dave = ""] = await createUsers(3);
      const sessionId = await createSession(booker);
      await commit(alice, sessionId);
      now = beforeStart(10);

      await withdraw(alice, sessionId);

      expect(await invitations(dave)).toEqual([]);
    });

    test("drops the invitation once the session starts", async () => {
      const [booker, alice = "", dave = ""] = await createUsers(3);
      const sessionId = await createSession(booker);
      await commit(alice, sessionId);
      now = beforeStart(10);
      await withdraw(alice, sessionId, { mode: "DIRECT_INVITE", inviteeId: dave });

      expect(await invitations(dave, startsAt)).toEqual([]);
    });
  });

  function joined(userId: UUID, at: Date = now) {
    return new PostgresJoinedSessionsReader(sql).list(userId, at);
  }

  function invitations(userId: UUID, at: Date = now) {
    return new PostgresReplacementInvitationsReader(sql).list(userId, at);
  }

  function unitOfWork() {
    return new PostgresCommitmentUnitOfWork(() => pool, clock);
  }

  function promote() {
    return new PromoteFromWaitlist({ unitOfWork: unitOfWork(), clock, ids, notifier });
  }

  async function commit(userId: UUID, sessionId: UUID) {
    return new CommitToSession({ unitOfWork: unitOfWork(), clock, ids }).forParticipant({
      userId,
      sessionId,
      idempotencyKey: randomUUID(),
    });
  }

  async function withdraw(
    userId: UUID,
    sessionId: UUID,
    replacement: ReplacementChoice = { mode: "OPEN_SLOT" },
  ) {
    return new WithdrawFromSession({ unitOfWork: unitOfWork(), clock, notifier, promote: promote() })
      .forParticipant({ userId, sessionId, idempotencyKey: randomUUID(), replacement });
  }

  async function leaveWaitlist(userId: UUID, sessionId: UUID) {
    return new LeaveWaitlist({ unitOfWork: unitOfWork(), clock, promote: promote() })
      .forParticipant({ userId, sessionId, idempotencyKey: randomUUID() });
  }

  async function createUsers(count: number, cents = 10_000): Promise<[UUID, ...UUID[]]> {
    const users = Array.from({ length: count }, () => randomUUID());
    for (const id of users) {
      await pool.query(
        "insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())",
        [id, `${id}@example.com`],
      );
      await new PostgresTransactor(pool).transaction(async (executor) => {
        const writer = new PostgresLedgerWriter(executor, `top-up-${id}`);
        await writer.creditTopUp({
          walletId: await writer.ensureWallet(id),
          amount: Money.fromCents(cents),
          occurredAt: new Date(),
          externalReference: `test-${id}`,
        });
      });
    }
    return users as [UUID, ...UUID[]];
  }

  /** A public two-place session starting `delayHours` after the shared start time. */
  async function createSession(bookerId: UUID, delayHours = 0): Promise<UUID> {
    const sessionId = randomUUID();
    const start = new Date(startsAt.getTime() + delayHours * HOUR);
    await pool.query(
      `insert into sessions (session_id, booker_id, venue_name, region, sport,
         start_at, end_at, total_cost_cents, total_slots,
         booking_share_cents, visibility, room_token, holding_account_id)
       values ($1, $2, 'Court', 'North', 'Badminton', $3, $4, $5, 3, $6,
         'PUBLIC', $7, $8)`,
      [
        sessionId,
        bookerId,
        start,
        new Date(start.getTime() + 2 * HOUR),
        2 * SHARE_CENTS,
        SHARE_CENTS,
        randomUUID(),
        holdingAccountId,
      ],
    );
    return sessionId;
  }
});
