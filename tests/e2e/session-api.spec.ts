import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PLATFORM_HOLDING_ACCOUNT_ID } from "@/lib/money/constants";
import { PostgresSessionCreationTransaction } from "@/lib/sessions/postgres-session-creation-transaction";
import { CreateSessions } from "@/use-cases/sessions/CreateSessions";
import { sessionTestContext } from "../support/session-test-context";

const body = () => ({
  idempotencyKey: randomUUID(),
  booking: {
    venueName: "Jurong East Sports Hall",
    region: "West",
    sport: "Badminton",
    startAt: "2030-01-02T10:00:00Z",
    endAt: "2030-01-02T12:00:00Z",
    totalCostCents: 1001,
  },
  config: { totalSlots: 3, },
});

test("authenticated creation replays atomically and refuses replay after deactivation", async ({
  request,
}) => {
  const context = sessionTestContext();
  try {
    const booker = await context.identity();
    const submission = body();
    const headers = { Authorization: `Bearer ${booker.token}` };
    const created = await request.post("/api/sessions", {
      headers,
      data: submission,
    });
    expect(created.status()).toBe(201);
    const result = await created.json();
    expect(result).toMatchObject({ bookingShareCents: 333 });
    const replays = await Promise.all(
      Array.from({ length: 4 }, () =>
        request.post("/api/sessions", {
          headers,
          data: submission,
        }),
      ),
    );
    for (const response of replays) {
      expect(response.status()).toBe(201);
      expect(await response.json()).toEqual(result);
    }
    const conflict = await request.post("/api/sessions", {
      headers,
      data: { ...submission, booking: { ...submission.booking, totalCostCents: 9999 } },
    });
    expect(conflict.status()).toBe(409);
    expect(await conflict.json()).toEqual({
      error: {
        code: "IDEMPOTENCY_CONFLICT",
        message: "This submission key was already used for different booking details",
      },
    });
    const recovered = await request.post("/api/sessions", { headers, data: submission });
    expect(recovered.status()).toBe(201);
    expect(await recovered.json()).toEqual(result);
    const normalizedReplay = await request.post("/api/sessions", {
      headers,
      data: {
        ...submission,
        booking: { ...submission.booking, startAt: "2030-01-02T18:00:00+08:00", endAt: "2030-01-02T20:00:00+08:00" },
      },
    });
    expect(normalizedReplay.status()).toBe(201);
    expect(await normalizedReplay.json()).toEqual(result);
    expect(
      (
        await context.pool.query(
          "select count(*)::int as count from sessions where booker_id = $1",
          [booker.userId],
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
    expect(
      (
        await context.pool.query(
          "select count(*)::int as count from ledger_entries where wallet_id = $1 or session_id = $2",
          [booker.walletId, result.sessionId],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    expect(
      (
        await context.pool.query(
          "select count(*)::int as count from payout_payables where session_id = $1",
          [result.sessionId],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    await context.pool.query(
      "update profiles set account_status = 'INACTIVE' where user_id = $1",
      [booker.userId],
    );
    const denied = await request.post("/api/sessions", {
      headers,
      data: submission,
    });
    expect(denied.status()).toBe(403);
    expect(await denied.json()).toMatchObject({
      error: { code: "INACTIVE_ACCOUNT" },
    });
  } finally {
    await context.pool.end();
  }
});

test("concurrent different requests sharing a new key create one session and return one conflict", async ({ request }) => {
  const context = sessionTestContext();
  try {
    const booker = await context.identity();
    const original = body();
    const changed = { ...original, booking: { ...original.booking, venueName: "Another sports hall" } };
    const headers = { Authorization: `Bearer ${booker.token}` };
    const [first, second] = await Promise.all([
      request.post("/api/sessions", { headers, data: original }),
      request.post("/api/sessions", { headers, data: changed }),
    ]);
    expect([first.status(), second.status()].sort()).toEqual([201, 409]);
    const winner = first.status() === 201
      ? { response: first, conflict: second, submission: original }
      : { response: second, conflict: first, submission: changed };
    const result = await winner.response.json();
    const conflict = await winner.conflict.json();
    expect(conflict).toEqual({
      error: { code: "IDEMPOTENCY_CONFLICT", message: "This submission key was already used for different booking details" },
    });
    const retry = await request.post("/api/sessions", { headers, data: winner.submission });
    expect(retry.status()).toBe(201);
    expect(await retry.json()).toEqual(result);
    expect((await context.pool.query(
      "select session_id, venue_name from sessions where booker_id = $1", [booker.userId],
    )).rows).toEqual([{ session_id: result.sessionId, venue_name: winner.submission.booking.venueName }]);
  } finally {
    await context.pool.end();
  }
});

test("HTTP retries recover legacy results without rewriting their fingerprint", async ({ request }) => {
  const context = sessionTestContext();
  try {
    const booker = await context.identity();
    const submission = body();
    const clock = { now: () => new Date("2029-01-01T00:00:00Z") };
    const legacy = new CreateSessions({
      transaction: new PostgresSessionCreationTransaction(context.pool, { idempotencyKey: submission.idempotencyKey }, clock),
      clock, ids: { next: randomUUID }, holdingAccountId: PLATFORM_HOLDING_ACCOUNT_ID,
    });
    const result = await legacy.forBooker(booker.userId, {
      ...submission.booking,
      startAt: new Date(submission.booking.startAt), endAt: new Date(submission.booking.endAt),
    }, submission.config);
    const key = JSON.stringify(["UC2-02", booker.userId, submission.idempotencyKey]);
    const stored = await context.pool.query("select request_fingerprint, response from idempotency_keys where idempotency_key = $1", [key]);
    const replay = await request.post("/api/sessions", {
      headers: { Authorization: `Bearer ${booker.token}` },
      data: { ...submission, booking: { ...submission.booking, totalCostCents: 9999 } },
    });
    expect(replay.status()).toBe(201);
    expect(await replay.json()).toEqual(result);
    expect((await context.pool.query("select request_fingerprint, response from idempotency_keys where idempotency_key = $1", [key])).rows).toEqual(stored.rows);
    expect((await context.pool.query("select session_id from sessions where booker_id = $1", [booker.userId])).rows).toEqual([{ session_id: result.sessionId }]);
  } finally {
    await context.pool.end();
  }
});

test("the same HTTP key is isolated by authenticated booker despite forged body identities", async ({ request }) => {
  const context = sessionTestContext();
  try {
    const bookers = await Promise.all([context.identity(), context.identity()]);
    const submission = body();
    const responses = await Promise.all(bookers.map((booker, index) => request.post("/api/sessions", {
      headers: { Authorization: `Bearer ${booker.token}` },
      data: { ...submission, bookerId: index === 0 ? bookers[1].userId : bookers[0].userId },
    })));
    for (const response of responses) expect(response.status()).toBe(201);
    const results = await Promise.all(responses.map((response) => response.json()));
    expect(results[0].sessionId).not.toBe(results[1].sessionId);
    for (const [index, booker] of bookers.entries()) {
      expect((await context.pool.query("select session_id from sessions where booker_id = $1", [booker.userId])).rows)
        .toEqual([{ session_id: results[index].sessionId }]);
    }
  } finally {
    await context.pool.end();
  }
});

test("missing, malformed and rejected bearer credentials return JSON 401", async ({
  request,
}) => {
  for (const authorization of [
    undefined,
    "Basic invalid",
    "Bearer invalid-token",
  ]) {
    const response = await request.post("/api/sessions", {
      headers: authorization ? { Authorization: authorization } : {},
      data: body(),
    });
    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  }
});

test("payout eligibility and invalid input retain distinct responses", async ({
  request,
}) => {
  const context = sessionTestContext();
  try {
    const booker = await context.identity(false);
    const headers = { Authorization: `Bearer ${booker.token}` };
    expect(
      (await request.post("/api/sessions", { headers, data: body() })).status(),
    ).toBe(409);
    const eligibleIdentity = await context.identity();
    expect(
      (
        await request.post("/api/sessions", {
          headers,
          data: { ...body(), bookerId: eligibleIdentity.userId },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await request.post("/api/sessions", {
          headers,
          data: {
            ...body(),
            config: { totalSlots: "three", },
          },
        })
      ).status(),
    ).toBe(400);
    expect(
      (await request.post("/api/sessions", { headers, data: "{" })).status(),
    ).toBe(400);
  } finally {
    await context.pool.end();
  }
});

test("a verified identity whose profile is missing returns 404", async ({
  request,
}) => {
  const context = sessionTestContext();
  try {
    const identity = await context.identity(false);
    await context.pool.query("delete from profiles where user_id = $1", [
      identity.userId,
    ]);
    const response = await request.post("/api/sessions", {
      headers: { Authorization: `Bearer ${identity.token}` },
      data: body(),
    });
    expect(response.status()).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  } finally {
    await context.pool.end();
  }
});
