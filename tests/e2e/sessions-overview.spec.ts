import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { sessionFeedResponseSchema } from "../../app/sessions/session-feed-contract";
import { PLATFORM_HOLDING_ACCOUNT_ID } from "../../lib/money/constants";
import { addCancellationParticipant, cancellationSql } from "../support/cancellation-fixtures";
import { sessionTestContext, type SessionTestContext } from "../support/session-test-context";

/** All records belong to the guarded disposable stack; admission uses the existing held-funds fixture. */
async function insertOverviewSession(context: SessionTestContext, input: {
  bookerId: string;
  venueName: string;
  minute?: number;
  visibility?: "PRIVATE" | "PUBLIC";
}): Promise<string> {
  const sessionId = randomUUID();
  const startAt = new Date(Date.UTC(2045, 5, 17, 10, input.minute ?? 0));
  await context.pool.query(
    `insert into sessions(session_id,booker_id,venue_name,region,sport,start_at,end_at,total_cost_cents,
      total_slots,minimum_headcount,booking_share_cents,visibility,room_token,holding_account_id)
      values ($1,$2,$3,'West','Tennis',$4,$5,2000,4,2,500,$6,$7,$8)`,
    [sessionId, input.bookerId, input.venueName, startAt, new Date(startAt.getTime() + 3_600_000),
      input.visibility ?? "PRIVATE", randomUUID(), PLATFORM_HOLDING_ACCOUNT_ID],
  );
  return sessionId;
}

test("personal sessions mount real joined data, paginate with login cookies, and switch to owned hosting cards", async ({ page, request }) => {
  test.setTimeout(60_000);
  const context = sessionTestContext();
  try {
    const viewer = await context.identity(false);
    const otherHost = await context.identity(false);
    const prefix = `Overview-${randomUUID().slice(0, 8)}`;
    const joined: { sessionId: string; venueName: string }[] = [];
    for (let index = 0; index < 14; index++) {
      const venueName = `${prefix} joined ${String(index).padStart(2, "0")}`;
      const sessionId = await insertOverviewSession(context, {
        bookerId: otherHost.userId, venueName, minute: index, visibility: index % 2 ? "PUBLIC" : "PRIVATE",
      });
      await addCancellationParticipant(cancellationSql(context), sessionId, viewer);
      joined.push({ sessionId, venueName });
    }
    const hostedVenue = `${prefix} hosted`;
    const hostedId = await insertOverviewSession(context, { bookerId: viewer.userId, venueName: hostedVenue });
    const unrelated = await Promise.all(["PRIVATE", "PUBLIC"].map((visibility) => insertOverviewSession(context, {
      bookerId: otherHost.userId, venueName: `${prefix} unrelated ${visibility}`,
      visibility: visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
    })));

    expect((await request.get("/api/sessions/mine?tab=joined")).status()).toBe(401);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/login?next=%2Fsessions");
    await page.getByLabel("Email", { exact: true }).fill(viewer.email);
    await page.getByLabel("Password", { exact: true }).fill(viewer.password);
    const firstRead = page.waitForRequest((candidate) => {
      const url = new URL(candidate.url());
      return url.pathname === "/api/sessions/mine" && url.searchParams.get("tab") === "joined";
    });
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page).toHaveURL(/\/sessions$/);
    const firstRequest = await firstRead;
    expect(await firstRequest.headerValue("authorization")).toBeNull();
    expect(Boolean(await firstRequest.headerValue("cookie"))).toBe(true);
    const firstResponse = await firstRequest.response();
    if (!firstResponse) throw new Error("Joined session request did not receive a response");
    expect(firstResponse.status()).toBe(200);
    expect(firstResponse.headers()["cache-control"]).toBe("no-store");
    const firstPage = sessionFeedResponseSchema.parse(await firstResponse.json());
    expect(firstPage.sessions.map((session) => session.sessionId)).toEqual(joined.slice(0, 12).map((session) => session.sessionId));
    expect(firstPage).toMatchObject({ upcomingCount: 14, pastCount: 0 });
    expect(firstPage.nextCursor).not.toBeNull();
    expect(firstPage.sessions.every((session) => session.role === "PARTICIPANT")).toBe(true);
    expect(firstPage.sessions.some((session) => unrelated.includes(session.sessionId) || session.sessionId === hostedId)).toBe(false);

    const tabs = page.getByRole("navigation", { name: "Session views", exact: true });
    await expect(tabs.getByRole("button", { name: "Joined", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("article", { name: `Tennis Court Booking at ${joined[0]?.venueName}`, exact: true })).toBeVisible();
    // page.request shares the browser's real login cookies and supplies no bearer header.
    const next = await page.request.get("/api/sessions/mine", { params: { tab: "joined", cursor: firstPage.nextCursor! } });
    expect(next.status()).toBe(200);
    const secondPage = sessionFeedResponseSchema.parse(await next.json());
    expect(secondPage.sessions.map((session) => session.sessionId)).toEqual(joined.slice(12).map((session) => session.sessionId));
    expect(secondPage.asOf).toBe(firstPage.asOf);
    expect(secondPage.nextCursor).toBeNull();
    expect((await page.request.get("/api/sessions/mine", {
      params: { tab: "hosting", cursor: firstPage.nextCursor! },
    })).status()).toBe(400);
    expect((await request.get("/api/sessions/mine", {
      params: { tab: "joined", cursor: firstPage.nextCursor! },
      headers: { Authorization: `Bearer ${otherHost.token}` },
    })).status()).toBe(400);

    const hostingRead = page.waitForResponse((candidate) => {
      const url = new URL(candidate.url());
      return url.pathname === "/api/sessions/mine" && url.searchParams.get("tab") === "hosting";
    });
    await tabs.getByRole("button", { name: "Hosting", exact: true }).click();
    const hostingResponse = await hostingRead;
    expect(hostingResponse.status()).toBe(200);
    const hosting = sessionFeedResponseSchema.parse(await hostingResponse.json());
    expect(hosting.sessions.map((session) => session.sessionId)).toEqual([hostedId]);
    expect(hosting.sessions[0]?.role).toBe("HOST");
    await expect(tabs.getByRole("button", { name: "Hosting", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: `Manage Tennis Court Booking at ${hostedVenue}`, exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Joined session timeline", exact: true })).toHaveCount(0);
  } finally {
    await context.pool.end();
  }
});
