import type { Pool } from "pg";
import { describe, expect, test, vi } from "vitest";
import { fingerprintOf } from "@/lib/money/idempotency";
import { PostgresSessionCreationTransaction } from "@/lib/sessions/postgres-session-creation-transaction";
import type { RequestBoundSessionCreationSubmission } from "@/lib/sessions/request-session-creation-transaction";

const bookerId = "11111111-1111-4111-8111-111111111111";
const clock = { now: () => new Date("2029-01-01T00:00:00Z") };
const result = { sessionId: "session", roomToken: "private-token", bookingShareCents: 250 };
const key = (id = "submission", actor = bookerId) => JSON.stringify(["UC2-02", actor, id]);

function submission(id = "submission"): RequestBoundSessionCreationSubmission {
  return {
    idempotencyKey: id,
    request: {
      bookerId,
      booking: {
        venueName: "Jurong East Sports Hall", region: "West", sport: "Badminton",
        startAt: new Date("2030-01-01T10:00:00Z"), endAt: new Date("2030-01-01T12:00:00Z"), totalCostCents: 1000,
      },
      config: { totalSlots: 5, },
    },
  };
}

describe("UC2-02 request-bound PostgreSQL transaction adapter", () => {
  test("stores a payload fingerprint and replays an identical retry across instances", async () => {
    const database = fakeDatabase();
    const input = submission();
    const work = vi.fn(async () => { database.state.created += 1; return result; });
    const first = await new PostgresSessionCreationTransaction(database.pool, input, clock).runForBooker(bookerId, work);
    const replay = await new PostgresSessionCreationTransaction(database.pool, submission(), clock).runForBooker(bookerId, work);
    expect(first).toEqual(result);
    expect(replay).toEqual(first);
    expect(work).toHaveBeenCalledOnce();
    expect(database.state.created).toBe(1);
    expect(database.state.keys.get(key())?.fingerprint).toBe(fingerprintOf(input.request));
    expect(database.state.keys.get(key())?.fingerprint).not.toBe(fingerprintOf({ idempotencyKey: key() }));
  });

  test.each(["venue", "cost", "slots", "price", "visibility"] as const)(
    "rejects a changed %s on a new payload-bound key without executing work", async (field) => {
      const database = fakeDatabase();
      await new PostgresSessionCreationTransaction(database.pool, submission(), clock).runForBooker(bookerId, async () => result);
      const changed = submission();
      const request = {
        ...changed.request,
        booking: {
          ...changed.request.booking,
          ...(field === "venue" ? { venueName: "Another venue" } : {}),
          ...(field === "cost" ? { totalCostCents: 1200 } : {}),
        },
        config: {
          ...changed.request.config,
          ...(field === "slots" ? { totalSlots: 6 } : {}),
          ...(field === "price" ? { pricePerSlotCents: 300 } : {}),
          ...(field === "visibility" ? { visibility: "PUBLIC" as const } : {}),
        },
      };
      const work = vi.fn(async () => result);
      await expect(new PostgresSessionCreationTransaction(database.pool, { ...changed, request }, clock)
        .runForBooker(bookerId, work)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      expect(work).not.toHaveBeenCalled();
      expect(database.state.keys.get(key())?.fingerprint).toBe(fingerprintOf(submission().request));
    },
  );

  test("keeps the same key independent between different authenticated bookers", async () => {
    const database = fakeDatabase();
    const otherId = "22222222-2222-4222-8222-222222222222";
    const first = submission();
    const second = { ...submission(), request: { ...submission().request, bookerId: otherId } };
    const work = vi.fn(async () => result);
    await new PostgresSessionCreationTransaction(database.pool, first, clock).runForBooker(bookerId, work);
    await new PostgresSessionCreationTransaction(database.pool, second, clock).runForBooker(otherId, work);
    expect(work).toHaveBeenCalledTimes(2);
    expect(database.state.keys.size).toBe(2);
  });

  test("a new key creates a separate logical submission", async () => {
    const database = fakeDatabase();
    const work = vi.fn(async () => result);
    for (const id of ["first", "second"]) {
      await new PostgresSessionCreationTransaction(database.pool, submission(id), clock).runForBooker(bookerId, work);
    }
    expect(work).toHaveBeenCalledTimes(2);
  });

  test("legacy successful keys replay without recreating a session", async () => {
    const database = fakeDatabase();
    database.seed(fingerprintOf({ idempotencyKey: key() }));
    const work = vi.fn(async () => result);
    const replay = await new PostgresSessionCreationTransaction(database.pool, submission(), clock).runForBooker(bookerId, work);
    expect(replay).toEqual(result);
    expect(work).not.toHaveBeenCalled();
    expect(database.accountChecks).toBe(1);
    expect(database.state.keys.get(key())?.fingerprint).toBe(fingerprintOf({ idempotencyKey: key() }));
  });

  test.each([[2, 2], [5, 2], [5, 5], [30, 30]])(
    "replays a successful %s-place request recorded with minimum headcount %s", async (totalSlots, minimumHeadcount) => {
      const database = fakeDatabase();
      const input = submission();
      const request = { ...input.request, config: { totalSlots } };
      const fingerprint = fingerprintOf({ ...request, config: { totalSlots, minimumHeadcount } });
      database.seed(fingerprint);
      const work = vi.fn(async () => { database.state.created += 1; return result; });

      const replay = await new PostgresSessionCreationTransaction(database.pool, { ...input, request }, clock)
        .runForBooker(bookerId, work);

      expect(replay).toEqual(result);
      expect(work).not.toHaveBeenCalled();
      expect(database.state.created).toBe(0);
      expect(database.state.keys.get(key())?.fingerprint).toBe(fingerprint);
      expect(database.accountChecks).toBe(1);
    },
  );

  test.each(["venue", "cost", "slots", "price", "visibility"] as const)(
    "keeps changed %s conflicting against a retired-headcount request", async (field) => {
      const database = fakeDatabase();
      const input = submission();
      database.seed(fingerprintOf({ ...input.request, config: { ...input.request.config, minimumHeadcount: 2 } }));
      const request = {
        ...input.request,
        booking: {
          ...input.request.booking,
          ...(field === "venue" ? { venueName: "Another venue" } : {}),
          ...(field === "cost" ? { totalCostCents: 1200 } : {}),
        },
        config: {
          ...input.request.config,
          ...(field === "slots" ? { totalSlots: 6 } : {}),
          ...(field === "price" ? { pricePerSlotCents: 300 } : {}),
          ...(field === "visibility" ? { visibility: "PUBLIC" as const } : {}),
        },
      };
      const work = vi.fn(async () => result);

      await expect(new PostgresSessionCreationTransaction(database.pool, { ...input, request }, clock)
        .runForBooker(bookerId, work)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      expect(work).not.toHaveBeenCalled();
    },
  );

  test.each([[5, 1], [5, 6], [5, 2.5], [31, 2]])(
    "does not accept an impossible historical capacity %s and headcount %s", async (totalSlots, minimumHeadcount) => {
      const database = fakeDatabase();
      const input = submission();
      const request = { ...input.request, config: { totalSlots } };
      database.seed(fingerprintOf({ ...request, config: { totalSlots, minimumHeadcount } }));
      const work = vi.fn(async () => result);

      await expect(new PostgresSessionCreationTransaction(database.pool, { ...input, request }, clock)
        .runForBooker(bookerId, work)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      expect(work).not.toHaveBeenCalled();
    },
  );

  test.each(["IN_PROGRESS", "FAILED"])("never replays or executes a retired-headcount %s record", async (status) => {
    const database = fakeDatabase();
    const input = submission();
    database.seed(fingerprintOf({ ...input.request, config: { ...input.request.config, minimumHeadcount: 2 } }));
    database.state.keys.get(key())!.status = status;
    const work = vi.fn(async () => result);

    await expect(new PostgresSessionCreationTransaction(database.pool, input, clock)
      .runForBooker(bookerId, work)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(work).not.toHaveBeenCalled();
    expect(database.state.keys.get(key())?.status).toBe(status);
  });

  test("historical probes cannot execute work if a key disappears after the conflict read", async () => {
    const database = fakeDatabase();
    database.seed(fingerprintOf({ differentRequest: true }));
    database.removeKeyAfterRead = true;
    const work = vi.fn(async () => { database.state.created += 1; return result; });
    await expect(new PostgresSessionCreationTransaction(database.pool, submission(), clock)
      .runForBooker(bookerId, work)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(work).not.toHaveBeenCalled();
    expect(database.state.created).toBe(0);
    expect(database.state.keys.size).toBe(0);
  });

  test.each(["legacy", "bound", "retired-headcount"])("rechecks account access before a %s replay", async (kind) => {
    const database = fakeDatabase();
    const request = submission().request;
    database.seed(fingerprintOf(kind === "legacy" ? { idempotencyKey: key() }
      : kind === "retired-headcount" ? { ...request, config: { ...request.config, minimumHeadcount: 2 } } : request));
    database.accountStatus = "INACTIVE";
    const work = vi.fn(async () => result);
    await expect(new PostgresSessionCreationTransaction(database.pool, submission(), clock)
      .runForBooker(bookerId, work)).rejects.toMatchObject({ code: "INACTIVE_ACCOUNT" });
    expect(work).not.toHaveBeenCalled();
    expect(database.claims).toBe(0);
  });

  test("rolls back a failed operation and lets the same submission retry", async () => {
    const database = fakeDatabase();
    await expect(new PostgresSessionCreationTransaction(database.pool, submission(), clock).runForBooker(bookerId, async () => {
      database.state.created += 1;
      throw new Error("write failed");
    })).rejects.toThrow("write failed");
    expect(database.state.created).toBe(0);
    expect(database.state.keys.size).toBe(0);
    await new PostgresSessionCreationTransaction(database.pool, submission(), clock).runForBooker(bookerId, async () => {
      database.state.created += 1;
      return result;
    });
    expect(database.state.created).toBe(1);
  });

  test("rejects mismatched submission identity before opening a transaction", async () => {
    const database = fakeDatabase();
    await expect(new PostgresSessionCreationTransaction(database.pool, submission(), clock)
      .runForBooker("other-booker", async () => result)).rejects.toMatchObject({ name: "SessionPersistenceError" });
    expect(database.connections).toBe(0);
  });
});

interface StoredKey { fingerprint: string; status: string; response?: string }
interface State { keys: Map<string, StoredKey>; created: number }

/** Models rollback and replay rows only; this is not a PostgreSQL concurrency test. */
function fakeDatabase() {
  let snapshot: State | undefined;
  const database = {
    state: { keys: new Map<string, StoredKey>(), created: 0 } as State,
    accountStatus: "ACTIVE",
    accountChecks: 0,
    claims: 0,
    connections: 0,
    removeKeyAfterRead: false,
    seed(fingerprint: string) {
      database.state.keys.set(key(), { fingerprint, status: "SUCCEEDED", response: JSON.stringify({ value: result }) });
    },
    pool: undefined as unknown as Pool,
  };
  const query = async (statement: string, values: readonly unknown[] = []) => {
    if (statement.startsWith("begin")) { snapshot = structuredClone(database.state); return { rows: [] }; }
    if (statement === "commit") { snapshot = undefined; return { rows: [] }; }
    if (statement === "rollback") {
      if (snapshot) database.state = snapshot;
      snapshot = undefined;
      return { rows: [] };
    }
    if (statement.includes("from profiles")) {
      database.accountChecks += 1;
      return { rows: [{ account_status: database.accountStatus, email: "booker@example.com" }] };
    }
    const id = String(values[0]);
    if (statement.includes("insert into idempotency_keys")) {
      database.claims += 1;
      if (database.state.keys.has(id)) return { rows: [] };
      database.state.keys.set(id, { fingerprint: String(values[2]), status: "IN_PROGRESS" });
      return { rows: [{ idempotency_key: id }] };
    }
    if (statement.includes("from idempotency_keys")) {
      const stored = database.state.keys.get(id);
      if (database.removeKeyAfterRead) {
        // Model an external deletion that survives this transaction's rollback.
        database.state.keys.delete(id);
        snapshot?.keys.delete(id);
        database.removeKeyAfterRead = false;
      }
      return { rows: stored ? [{ status: stored.status, request_fingerprint: stored.fingerprint, response: stored.response }] : [] };
    }
    if (statement.includes("set status = 'SUCCEEDED'")) {
      const stored = database.state.keys.get(id);
      if (!stored) throw new Error("No idempotency claim");
      stored.status = "SUCCEEDED";
      stored.response = String(values[1]);
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${statement}`);
  };
  database.pool = { connect: async () => {
    database.connections += 1;
    return { query, release: () => {} };
  } } as unknown as Pool;
  return database;
}
