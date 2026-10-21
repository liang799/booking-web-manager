import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { sessionTestContext, type SessionTestContext } from "../support/session-test-context";
import { pendingStorageKey } from "../../app/sessions/create/model";
import { savedDraftStorageKey } from "../../app/sessions/create/saved-session-draft";

type Identity = Awaited<ReturnType<SessionTestContext["identity"]>>;
async function login(page: Page, identity: Identity, destination = "/sessions") {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email", { exact: true }).fill(identity.email);
  await page.getByLabel("Password", { exact: true }).fill(identity.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.replace(/[?]/g, "\\?")}$`));
}
const desktop = (page: Page) => (page.viewportSize()?.width ?? 1280) >= 768;
const nextButton = (page: Page) => page.getByRole("button", { name: desktop(page) ? "Continue" : "Next", exact: true });
const createButton = (page: Page) => page.getByRole("button", { name: desktop(page) ? "Create session" : "Done", exact: true });
const priceInput = (page: Page) => page.getByLabel(desktop(page) ? "Price per slot (SGD)" : "Adjust price per slot (SGD)", { exact: true });

async function venueDetails(page: Page, venue: string) {
  await page.getByRole("button", { name: "Enter venue manually", exact: true }).click();
  await page.getByRole("combobox", { name: "Venue", exact: true }).fill(venue);
  await page.getByRole("combobox", { name: "Region", exact: true }).click();
  await page.getByRole("option", { name: "West", exact: true }).click();
  await page.getByLabel(desktop(page) ? "Booked venue cost (SGD)" : "Booking cost (SGD)", { exact: true }).fill("60.00");
}
async function details(page: Page, venue: string) {
  if (desktop(page)) {
    await page.getByLabel("Date", { exact: true }).fill("2045-06-17");
    await page.getByLabel("Start time", { exact: true }).fill("23:00");
    await page.getByRole("combobox", { name: "Duration", exact: true }).click();
    await page.getByRole("option", { name: "2 hours", exact: true }).click();
    await expect(page.getByText(/Your session will end at/)).toContainText("18 Jun 2045");
    await nextButton(page).click();
    await venueDetails(page, venue);
    return;
  }
  await venueDetails(page, venue);
  await page.getByRole("button", { name: "Edit booking schedule" }).click();
  await page.getByLabel("Start date", { exact: true }).fill("2045-06-17");
  await page.getByLabel("Start time", { exact: true }).fill("23:00");
  await page.getByLabel("Duration (minutes)").fill("120");
  await expect(page.getByLabel("End date", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("End time", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog").getByText(/Ends 18 Jun 2045/)).toContainText("next day");
  await page.getByRole("button", { name: "Save schedule" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/Ends 18 Jun 2045/)).toBeVisible();
}
async function pricing(page: Page, venue: string) {
  await details(page, venue);
  await nextButton(page).click();
  await nextButton(page).click();
  await priceInput(page).fill("12.01");
}

test("UC2-02 validates, creates a custom-priced overnight booking and refreshes the hosted list", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const context = sessionTestContext();
  try {
    const booker = await context.identity();
    const venue = `Create-${randomUUID().slice(0, 8)}`;
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, booker);
    await expect(page.getByText("No upcoming sessions to manage")).toBeVisible();
    await page.getByRole("link", { name: "Create a session", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Booked Venue Details" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main", exact: true })).not.toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Venue", exact: true })).toBeFocused();
    await expect(page.getByText("Enter or select a venue.")).toBeVisible();
    await page.getByRole("combobox", { name: "Venue", exact: true }).fill("Court");
    await expect(page.getByText("Venue search is unavailable. Enter the venue and region manually.")).toBeVisible();
    await details(page, venue);
    await page.screenshot({ path: testInfo.outputPath("details-390.png"), fullPage: true });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Booked Venue Settings" })).toBeFocused();
    await page.getByRole("combobox", { name: "Room Visibility" }).click();
    await page.getByRole("option", { name: "Public", exact: true }).click();
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("settings-390.png"), fullPage: true });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Adjust price per slot (SGD)").fill("12.01");
    await expect(page.getByRole("status")).toHaveText("S$96.08");
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await createButton(page).scrollIntoViewIfNeeded();
      await expect(createButton(page)).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const photo = page.locator('section[aria-label="Create a session"] img');
      if (width === 768) await expect(photo).not.toBeVisible();
      else {
        await expect(photo).toBeVisible();
        const bounds = await photo.boundingBox();
        expect(bounds!.width / bounds!.height).toBeCloseTo(width < 768 ? 1.5 : 16 / 9, 1);
      }
      await page.screenshot({ path: testInfo.outputPath(`pricing-${width}.png`), fullPage: true });
    }
    await page.getByLabel("Price per slot slider").focus();
    await page.keyboard.press("ArrowRight");
    await expect(priceInput(page)).toHaveValue("12.02");
    const result = page.waitForResponse((response) => response.url().endsWith("/api/sessions") && response.request().method() === "POST");
    await createButton(page).click();
    expect((await result).status()).toBe(201);
    expect((await result).request().postDataJSON().config).toEqual({
      totalSlots: 8, minimumHeadcount: 4, visibility: "PUBLIC", minimumReliability: 90, pricePerSlotCents: 1202,
    });
    await expect(page).toHaveURL(/\/sessions\?created=1$/);
    await expect(page.getByRole("status")).toHaveText("Your session was created successfully.");
    await expect(page.getByRole("article", { name: `Tennis at ${venue}` })).toBeVisible();
    expect(await page.evaluate((key) => sessionStorage.getItem(key), pendingStorageKey(booker.userId))).toBeNull();
    expect((await context.pool.query("select booking_share_cents, minimum_reliability, total_slots, minimum_headcount, start_at, end_at from sessions where booker_id = $1", [booker.userId])).rows).toEqual([{
      booking_share_cents: "1202", minimum_reliability: "90", total_slots: 8, minimum_headcount: 4,
      start_at: new Date("2045-06-17T15:00:00Z"), end_at: new Date("2045-06-17T17:00:00Z"),
    }]);
  } finally { await context.pool.end(); }
});

test("desktop creation restores a saved draft and creates a custom-duration session through all four screens", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const context = sessionTestContext();
  try {
    const booker = await context.identity();
    const venue = `Desktop-${randomUUID().slice(0, 8)}`;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page, booker, "/sessions/create");
    await expect(page.getByRole("heading", { name: "Create booking", exact: true })).toBeVisible();
    await nextButton(page).click();
    await expect(page.getByLabel("Date", { exact: true })).toBeFocused();
    await expect(page.getByText("Enter a valid start date, start time, and duration.")).toBeVisible();
    await page.getByLabel("Date", { exact: true }).fill("2045-06-17");
    await page.getByLabel("Start time", { exact: true }).fill("23:00");
    await page.getByRole("combobox", { name: "Duration", exact: true }).click();
    await page.getByRole("option", { name: "Custom duration", exact: true }).click();
    await page.getByLabel("Duration (minutes)", { exact: true }).fill("75");
    await expect(page.getByText(/Your session will end at/)).toContainText("18 Jun 2045");
    await page.screenshot({ path: testInfo.outputPath("desktop-schedule.png"), fullPage: true });
    await nextButton(page).click();
    await expect(page.getByRole("heading", { name: "What are you playing?", exact: true })).toBeFocused();
    await venueDetails(page, venue);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByText("Draft saved in this tab. You can come back to it later.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "What are you playing?", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Venue", exact: true })).toHaveValue(venue);
    await expect(page.getByLabel("Booked venue cost (SGD)", { exact: true })).toHaveValue("60.00");
    const summary = page.getByRole("complementary", { name: "Your session at a glance", exact: true });
    await expect(summary.getByText("1 hour 15 min", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("desktop-venue.png"), fullPage: true });
    await nextButton(page).click();
    await expect(page.getByRole("heading", { name: "Make it your kind of game.", exact: true })).toBeFocused();
    await page.getByRole("combobox", { name: "Room visibility", exact: true }).click();
    await page.getByRole("option", { name: "Public", exact: true }).click();
    await page.getByRole("button", { name: "Increase Number of slots", exact: true }).click();
    await page.getByRole("button", { name: "Increase Minimum viable headcount", exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath("desktop-settings.png"), fullPage: true });
    await nextButton(page).click();
    await expect(page.getByRole("heading", { name: "Set your price.", exact: true })).toBeFocused();
    await priceInput(page).fill("10.00");
    await expect(page.getByRole("status").filter({ hasText: /^S\$90\.00$/ })).toHaveText("S$90.00");
    await page.screenshot({ path: testInfo.outputPath("desktop-pricing.png"), fullPage: true });
    const result = page.waitForResponse((response) => response.url().endsWith("/api/sessions") && response.request().method() === "POST");
    await createButton(page).click();
    const response = await result;
    expect(response.status()).toBe(201);
    expect(response.request().postDataJSON()).toMatchObject({
      booking: { venueName: venue, region: "West", startAt: "2045-06-17T15:00:00.000Z", endAt: "2045-06-17T16:15:00.000Z", totalCostCents: 6000 },
      config: { totalSlots: 9, minimumHeadcount: 5, visibility: "PUBLIC", minimumReliability: 90, pricePerSlotCents: 1000 },
    });
    await expect(page).toHaveURL(/\/sessions\?created=1$/);
    await expect(page.getByRole("article", { name: `Tennis at ${venue}` })).toBeVisible();
    expect((await context.pool.query("select booking_share_cents, total_slots, minimum_headcount, start_at, end_at from sessions where booker_id = $1", [booker.userId])).rows).toEqual([{
      booking_share_cents: "1000", total_slots: 9, minimum_headcount: 5,
      start_at: new Date("2045-06-17T15:00:00Z"), end_at: new Date("2045-06-17T16:15:00Z"),
    }]);
  } finally { await context.pool.end(); }
});

test("saved desktop state restores on mobile and keeps custom duration mode across breakpoints", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const context = sessionTestContext();
  try {
    const booker = await context.identity();
    const venue = `Responsive-draft-${randomUUID().slice(0, 8)}`;
    const savedKey = savedDraftStorageKey(booker.userId);
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page, booker, "/sessions/create");
    await page.getByLabel("Date", { exact: true }).fill("2045-06-17");
    await page.getByLabel("Start time", { exact: true }).fill("23:00");
    await page.getByRole("combobox", { name: "Duration", exact: true }).click();
    await page.getByRole("option", { name: "Custom duration", exact: true }).click();
    await page.getByLabel("Duration (minutes)", { exact: true }).fill("120");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    const savedSchedule = await page.evaluate((key) => sessionStorage.getItem(key), savedKey);
    await nextButton(page).click();
    await expect(page.getByText("You have unsaved changes.", { exact: true })).toBeVisible();
    expect(await page.evaluate((key) => sessionStorage.getItem(key), savedKey)).toBe(savedSchedule);
    await venueDetails(page, venue);
    await nextButton(page).click();
    await expect(page.getByRole("heading", { name: "Make it your kind of game.", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    const savedSettings = await page.evaluate((key) => sessionStorage.getItem(key), savedKey);
    expect(JSON.parse(savedSettings!)).toMatchObject({ desktopStep: 3, duration: "120", durationMode: "custom" });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Booked Venue Settings", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Booked Venue Settings", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Booked Venue Details", exact: true })).toBeFocused();
    await expect(page.getByRole("combobox", { name: "Venue", exact: true })).toHaveValue(venue);
    await expect(page.getByLabel("Booking cost (SGD)", { exact: true })).toHaveValue("60.00");
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole("heading", { name: "What are you playing?", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("heading", { name: "When do you want to play?", exact: true })).toBeFocused();
    await expect(page.getByRole("combobox", { name: "Duration", exact: true })).toHaveText("Custom duration");
    await expect(page.getByLabel("Duration (minutes)", { exact: true })).toHaveValue("120");

    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(nextButton(page)).toBeVisible();
      if (desktop(page)) {
        await expect(page.getByRole("combobox", { name: "Duration", exact: true })).toHaveText("Custom duration");
        await expect(page.getByLabel("Duration (minutes)", { exact: true })).toHaveValue("120");
      } else {
        await page.getByRole("button", { name: "Edit booking schedule" }).click();
        await expect(page.getByLabel("Start date", { exact: true })).toHaveValue("2045-06-17");
        await expect(page.getByLabel("Duration (minutes)", { exact: true })).toHaveValue("120");
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`restored-draft-${width}.png`), fullPage: true });
    }
    expect(await page.evaluate((key) => sessionStorage.getItem(key), savedKey)).toBe(savedSettings);
    expect(await page.evaluate((key) => sessionStorage.getItem(key), pendingStorageKey(booker.userId))).toBeNull();
    expect((await context.pool.query("select count(*)::int as count from sessions where booker_id = $1", [booker.userId])).rows).toEqual([{ count: 0 }]);
  } finally { await context.pool.end(); }
});

test("a committed request with a lost response is frozen, restored on reload, and replayed once", async ({ page }) => {
  test.setTimeout(60_000);
  const context = sessionTestContext();
  try {
    const booker = await context.identity();
    const venue = `Replay-${randomUUID().slice(0, 8)}`;
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page, booker, "/sessions/create");
    await pricing(page, venue);
    const submissions: unknown[] = [];
    await page.route("**/api/sessions", async (route) => {
      submissions.push(route.request().postDataJSON());
      if (submissions.length === 1) { const response = await route.fetch(); expect(response.status()).toBe(201); await route.abort("failed"); }
      else await route.continue();
    });
    await createButton(page).click();
    await expect(page.getByRole("button", { name: "Retry submission" })).toBeVisible();
    await expect(priceInput(page)).toBeDisabled();
    await expect(page.getByRole("button", { name: "Back", exact: true })).toBeDisabled();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Set your price.", exact: true })).toBeVisible();
    await expect(priceInput(page)).toHaveValue("12.01");
    await expect(priceInput(page)).toBeDisabled();
    await page.getByRole("button", { name: "Retry submission" }).click();
    await expect(page).toHaveURL(/\/sessions\?created=1$/);
    expect(submissions).toHaveLength(2);
    expect(submissions[1]).toEqual(submissions[0]);
    expect((await context.pool.query("select count(*)::int as count from sessions where booker_id = $1", [booker.userId])).rows).toEqual([{ count: 1 }]);
  } finally { await context.pool.end(); }
});

test("payout readiness and server validation reject creation visibly without persisting a session", async ({ page, request }) => {
  test.setTimeout(60_000);
  const context = sessionTestContext();
  try {
    const booker = await context.identity(false);
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page, booker, "/sessions/create");
    await pricing(page, "Payout not ready court");
    await createButton(page).click();
    await expect(page.getByRole("region", { name: "Create a session" }).getByRole("alert")).toHaveText("Complete your payout account setup before creating a session.");
    await expect(page.getByRole("button", { name: "Back", exact: true })).toBeEnabled();
    const ready = await context.identity();
    const invalid = await request.post("/api/sessions", { headers: { Authorization: `Bearer ${ready.token}` }, data: {
      idempotencyKey: randomUUID(), booking: { venueName: "Court", region: "West", sport: "Tennis", startAt: "2045-06-17T07:00:00+08:00", endAt: "2045-06-17T08:00:00+08:00", totalCostCents: 6000 },
      config: { totalSlots: 8, minimumHeadcount: 4, pricePerSlotCents: 1501 },
    } });
    expect(invalid.status()).toBe(422);
    expect((await context.pool.query("select count(*)::int as count from sessions where booker_id = any($1::uuid[])", [[booker.userId, ready.userId]])).rows).toEqual([{ count: 0 }]);
  } finally { await context.pool.end(); }
});

test("venue fixtures support pagination, keyboard selection and manual region fallback on a short screen", async ({ page }) => {
  const context = sessionTestContext();
  try {
    const booker = await context.identity(false);
    await page.setViewportSize({ width: 390, height: 600 });
    await login(page, booker, "/sessions/create");
    await page.route("**/api/venues?**", async (route) => {
      expect(route.request().headers().authorization).toMatch(/^Bearer /);
      const pageNumber = new URL(route.request().url()).searchParams.get("page");
      await route.fulfill({ json: { items: [{ venueName: pageNumber === "2" ? "Second booked court" : "First booked court", address: "Fixture address", postalCode: "", latitude: 1.33, longitude: 103.74, region: pageNumber === "2" ? null : "West" }], nextPage: pageNumber === "2" ? null : 2 } });
    });
    const input = page.getByRole("combobox", { name: "Venue", exact: true });
    await input.fill("Court");
    await expect(page.getByRole("option", { name: /First booked court/ })).toBeVisible();
    await page.getByRole("button", { name: "More venues" }).click();
    await expect(page.getByRole("option", { name: /Second booked court/ })).toBeVisible();
    await input.focus();
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
    await expect(input).toHaveValue("Second booked court");
    await expect(page.getByText("Venue found. Choose a region below to continue.")).toBeVisible();
    await page.getByRole("combobox", { name: "Region", exact: true }).click();
    await page.getByRole("option", { name: "East", exact: true }).click();
    await input.fill("Edited court");
    await expect(page.getByLabel("Venue selected from OneMap")).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Region", exact: true })).toHaveText("Choose a region");
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeInViewport();
  } finally { await context.pool.end(); }
});
