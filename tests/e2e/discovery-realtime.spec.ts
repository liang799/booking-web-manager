import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PLATFORM_HOLDING_ACCOUNT_ID } from "../../lib/money/constants";
import { sessionTestContext, type SessionTestContext } from "../support/session-test-context";

function card(page: Page, venue: string) {
  return page.getByRole("listitem").filter({ hasText: venue });
}

async function insertSession(context: SessionTestContext, bookerId: string, venue: string, visibility: "PRIVATE" | "PUBLIC") {
  const sessionId = randomUUID();
  await context.pool.query(
    `insert into sessions (session_id, booker_id, venue_name, region, sport, start_at, end_at,
      total_cost_cents, total_slots, minimum_headcount, booking_share_cents, visibility, room_token, holding_account_id)
     values ($1,$2,$3,'West','Badminton',now() + interval '1 day',now() + interval '1 day 2 hours',
      200,2,2,100,$4,$5,$6)`,
    [sessionId, bookerId, venue, visibility, randomUUID(), PLATFORM_HOLDING_ACCOUNT_ID],
  );
  return sessionId;
}

test("anonymous discovery receives publish and hide within three seconds without losing drafts", async ({ page, request }) => {
  const context = sessionTestContext();
  try {
    const booker = await context.identity(false);
    const venue = `Anonymous-realtime-${randomUUID().slice(0, 8)}`;
    const sessionId = await insertSession(context, booker.userId, venue, "PRIVATE");
    await page.goto(`/discover?q=${venue}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("No sessions found", { exact: true })).toBeVisible();
    const search = page.getByRole("searchbox");
    await search.fill("An unsubmitted draft");
    await search.focus();
    const url = page.url();

    for (const visibility of ["PUBLIC", "PRIVATE"] as const) {
      const response = await request.patch(`/api/sessions/${sessionId}/visibility`, {
        headers: { Authorization: `Bearer ${booker.token}` }, data: { visibility },
      });
      expect(response.status()).toBe(200);
      const committedAt = Date.now();
      await expect(card(page, venue)).toHaveCount(visibility === "PUBLIC" ? 1 : 0, { timeout: 3_000 });
      expect(Date.now() - committedAt).toBeLessThanOrEqual(3_000);
      await expect(search).toHaveValue("An unsubmitted draft");
      await expect(search).toBeFocused();
      await expect(search).toBeEnabled();
      expect(page.url()).toBe(url);
    }
  } finally {
    await context.pool.end();
  }
});

for (const offset of [-60_000, 60_000]) {
  test(`anonymous discovery expires sessions with the browser clock ${offset < 0 ? "behind" : "ahead"}`, async ({ page }) => {
    const context = sessionTestContext();
    try {
      const booker = await context.identity(false);
      const venue = `Clock-skew-${randomUUID().slice(0, 8)}`;
      const sessionId = await insertSession(context, booker.userId, venue, "PUBLIC");
      // Shift only wall time, retaining native browser timers and performance.now.
      // A complete fake-clock installation also changes the scheduler under test.
      await page.addInitScript((offsetMs) => {
        globalThis.Date = new Proxy(Date, {
          construct(target, args, newTarget) {
            return Reflect.construct(target, args.length === 0 ? [target.now() + offsetMs] : args, newTarget);
          },
          apply(target) { return new target(target.now() + offsetMs).toString(); },
          get(target, property, receiver) {
            return property === "now" ? () => target.now() + offsetMs : Reflect.get(target, property, receiver);
          },
        });
      }, offset);
      const result = await context.pool.query<{ start_at: Date }>(
        "update sessions set start_at=statement_timestamp() + interval '7 seconds', end_at=statement_timestamp() + interval '2 hours 7 seconds' where session_id=$1 returning start_at",
        [sessionId],
      );
      const startsAt = result.rows[0]!.start_at.getTime();
      let backgroundRouteRefreshes = 0;
      page.on("request", request => {
        if (new URL(request.url()).pathname === "/discover" && request.headers().rsc === "1") {
          backgroundRouteRefreshes += 1;
        }
      });
      await page.goto(`/discover?q=${venue}`, { waitUntil: "domcontentloaded" });
      await expect(card(page, venue)).toBeVisible();
      await expect(card(page, venue)).toHaveCount(0, { timeout: Math.max(1, startsAt + 3_000 - Date.now()) });
      expect(Date.now()).toBeGreaterThanOrEqual(startsAt);
      expect(Date.now() - startsAt).toBeLessThanOrEqual(3_000);
      // Background reads must settle independently of Next's streamed route transitions.
      expect(backgroundRouteRefreshes).toBe(0);
    } finally {
      await context.pool.end();
    }
  });
}
