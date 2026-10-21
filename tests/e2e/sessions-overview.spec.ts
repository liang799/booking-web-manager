import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
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

function sessionUrl(sessionId: string, panel: "details" | "participants" = "participants") {
  const search = new URLSearchParams({ tab: "joined", session: sessionId, source: "overview-test" });
  if (panel === "participants") search.set("panel", panel);
  return `/sessions?${search}#timeline-test`;
}

async function expectExpandedSession(page: Page, session: { sessionId: string; venueName: string }, panel: "details" | "participants") {
  const row = page.locator(`[data-session-id="${session.sessionId}"]`);
  await expect(row).toHaveAttribute("data-current", "true");
  await expect(row.getByRole("tab", { name: panel === "details" ? "Details" : /^Participants/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("personal sessions authenticate pagination and restore URL selections without persisting dialogs", async ({ page, request }) => {
  test.setTimeout(120_000);
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

    const target = joined[12]!;
    await test.step("a deep link loads the thirteenth session and restores its panel after reload", async () => {
      await page.goto(sessionUrl(target.sessionId));
      await expectExpandedSession(page, target, "participants");
      await expect(page.getByRole("region", { name: "Joined session timeline" }).getByRole("article")).toHaveCount(14);
      const article = page.getByRole("article", { name: `Tennis Court Booking at ${target.venueName}`, exact: true });
      await article.getByRole("button", { name: "View session", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Tennis Court Booking", exact: true })).toBeVisible();
      await expect(page).toHaveURL((url) => url.searchParams.get("session") === target.sessionId && url.searchParams.get("panel") === "participants");
      await page.reload();
      await expectExpandedSession(page, target, "participants");

      await article.getByRole("tab", { name: "Details", exact: true }).click();
      await expect(page).toHaveURL((url) => url.searchParams.get("session") === target.sessionId && !url.searchParams.has("panel"));
      await article.getByRole("tab", { name: /^Participants/ }).click();
      await expect(page).toHaveURL((url) => url.searchParams.get("panel") === "participants"
        && url.searchParams.get("source") === "overview-test" && url.hash === "#timeline-test");
    });

    await test.step("native Back and Forward restore the expanded card and its panel", async () => {
      // These are separate history entries; normal UI changes replace the current entry.
      await page.evaluate((href) => window.history.pushState({ overviewTest: true }, "", href), sessionUrl(joined[0]!.sessionId, "details"));
      await expectExpandedSession(page, joined[0]!, "details");
      await page.evaluate((href) => window.history.pushState({ overviewTest: true }, "", href), sessionUrl(joined[1]!.sessionId));
      await expectExpandedSession(page, joined[1]!, "participants");
      await page.goBack();
      await expectExpandedSession(page, joined[0]!, "details");
      await page.goForward();
      await expectExpandedSession(page, joined[1]!, "participants");
    });

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
    await expect(page).toHaveURL((url) => url.searchParams.get("tab") === "hosting"
      && !url.searchParams.has("session") && !url.searchParams.has("panel")
      && url.searchParams.get("source") === "overview-test" && url.hash === "#timeline-test");
    expect(await page.evaluate(() => window.history.state.overviewTest)).toBe(true);
    await tabs.getByRole("button", { name: "Joined", exact: true }).click();
    await expectExpandedSession(page, joined[1]!, "participants");
    await expect(page).toHaveURL((url) => url.searchParams.get("session") === joined[1]!.sessionId && url.searchParams.get("panel") === "participants");

    await test.step("malformed state falls back safely and an inaccessible selection is removed only after exhaustion", async () => {
      await page.goto("/sessions?tab=invalid&session=not-a-uuid&panel=invalid&source=overview-test#timeline-test");
      await expectExpandedSession(page, joined[0]!, "details");
      await expect(tabs.getByRole("button", { name: "Joined", exact: true })).toHaveAttribute("aria-current", "page");
      await expect(page).toHaveURL((url) => url.searchParams.get("session") === "not-a-uuid" && url.searchParams.get("panel") === "invalid");
      await page.locator(`[data-session-id="${joined[0]!.sessionId}"] [data-date-control]`).click();
      await expect(page).toHaveURL((url) => url.searchParams.get("tab") === "joined"
        && url.searchParams.get("session") === joined[0]!.sessionId && !url.searchParams.has("panel")
        && url.searchParams.get("source") === "overview-test" && url.hash === "#timeline-test");

      // A real private session owned by another account must not be disclosed by its URL.
      await page.goto(sessionUrl(unrelated[0]!));
      await expect(page).toHaveURL((url) => !url.searchParams.has("session") && !url.searchParams.has("panel"));
      await expect(page.getByRole("status")).toHaveText("This session is no longer available in your joined sessions.");
      await expect(page.getByRole("region", { name: "Joined session timeline" }).getByRole("article")).toHaveCount(14);
      await expect(page.getByRole("article", { name: `Tennis Court Booking at ${prefix} unrelated PRIVATE`, exact: true })).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    await test.step("a failed continuation preserves the deep link for retry", async () => {
      let failNextPage = true;
      await page.route("**/api/sessions/mine?**", async (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.has("cursor") && failNextPage) {
          failNextPage = false;
          await route.abort("failed");
        } else await route.continue();
      });
      try {
        await page.goto(sessionUrl(target.sessionId));
        const feedError = page.getByRole("main").getByRole("alert");
        await expect(feedError).toHaveText("We couldn’t load your sessions. Please try again.");
        await expect(feedError).toBeVisible();
        await expect(page).toHaveURL((url) => url.searchParams.get("session") === target.sessionId && url.searchParams.get("panel") === "participants");
        await page.getByRole("button", { name: "Try again", exact: true }).click();
        await expectExpandedSession(page, target, "participants");
        await expect(feedError).toHaveCount(0);
      } finally {
        await page.unroute("**/api/sessions/mine?**");
      }
    });
  } finally {
    await context.pool.end();
  }
});
