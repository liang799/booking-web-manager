import { expect, test, type Page } from "@playwright/test";

const timeline = (page: Page) => page.getByRole("region", { name: "Joined session timeline" });
const current = (page: Page) => timeline(page).locator('[data-current="true"]');
const date = (page: Page, day: number) => timeline(page).getByRole("button", { name: `Show Tennis Court Booking, ${day} Oct 2026`, exact: true });
const row = (page: Page, day: number) => date(page, day).locator("..");
const weight = (page: Page, day: number) => row(page, day).evaluate((el) => Number(el.style.getPropertyValue("--expansion")));

async function pointAtPhoto(page: Page) {
  const bounds = await current(page).locator('[data-timeline-reveal="hero"]').boundingBox();
  if (!bounds) throw new Error("The selected session photo is missing");
  await page.mouse.move(bounds.x + bounds.width / 2, Math.max(210, bounds.y + 80));
}

async function goToDate(page: Page, day: number) {
  await date(page, day).evaluate((button) => button.focus({ preventScroll: true }));
  await page.keyboard.press("Enter");
  await expect(date(page, day)).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => weight(page, day)).toBe(1);
  await expect.poll(() => row(page, day).evaluate((el) => {
    const root = el.closest('[role="region"]')!;
    const readingTop = parseFloat(getComputedStyle(root).getPropertyValue("--reading-top"));
    const heading = el.previousElementSibling;
    const label = heading?.matches("h2") ? heading.getBoundingClientRect().height : 0;
    return Math.abs(el.getBoundingClientRect().top - readingTop - label);
  })).toBeLessThan(1);
}

async function geometry(page: Page) {
  return timeline(page).evaluate((root) => ({
    y: scrollY, height: root.getBoundingClientRect().height, documentHeight: document.documentElement.scrollHeight,
    rows: Array.from(root.querySelectorAll<HTMLElement>("[data-session-id]"), (el) => ({
      id: el.dataset.sessionId, top: el.getBoundingClientRect().top, height: el.getBoundingClientRect().height,
      expansion: Number(el.style.getPropertyValue("--expansion")),
    })),
  }));
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Real AppShell, view and Zustand provider with a deterministic chronological feed.
  await page.goto("/storybook/iframe.html?id=sessions-overview--desktop-wheel-navigation&viewMode=story");
  await expect(date(page, 21)).toHaveAttribute("aria-expanded", "true");
  await expect(timeline(page)).toHaveAttribute("data-timeline-entrance", "complete");
  await expect.poll(() => weight(page, 21)).toBe(1);
});

test("native scrolling visibly progresses without repositioning or changing document height", async ({ page }, testInfo) => {
  await pointAtPhoto(page);
  // Catch compensating scroll calls even if a large teleport still produces a
  // plausible final screenshot. Native wheel input must remain the sole driver.
  await page.evaluate(() => {
    const calls: string[] = [];
    Object.defineProperty(window, "timelineScrollCalls", { value: calls });
    for (const name of ["scrollTo", "scrollBy"] as const) {
      const original = window[name];
      Object.defineProperty(window, name, { value: (...args: unknown[]) => { calls.push(name); Reflect.apply(original, window, args); } });
    }
  });
  const before = await geometry(page);
  await page.mouse.wheel(0, 40);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before.y + 35);
  await expect.poll(() => weight(page, 21)).toBeLessThan(.8);
  const between = await geometry(page);
  expect(between.y - before.y).toBeCloseTo(40, 0);
  expect(between.height).toBeCloseTo(before.height, 0);
  expect(between.documentHeight).toBe(before.documentHeight);
  // Only native scrolling moves rows outside the two participating cards.
  expect(between.rows[8]!.top - before.rows[8]!.top).toBeCloseTo(-40, 0);
  expect(between.rows[6]!.height).toBeLessThan(before.rows[6]!.height - 40);
  expect(between.rows[7]!.height).toBeGreaterThan(before.rows[7]!.height + 40);
  expect(await weight(page, 21)).toBeGreaterThan(.5);
  expect(await weight(page, 23)).toBeGreaterThan(.2);
  const outgoingFont = await date(page, 21).locator("strong").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(outgoingFont).toBeGreaterThan(28);
  expect(outgoingFont).toBeLessThan(52);
  await page.screenshot({ path: testInfo.outputPath("joined-progress.png") });
  await page.mouse.wheel(0, 104);
  await expect.poll(() => weight(page, 23)).toBe(1);
  await expect(date(page, 23)).toHaveAttribute("aria-expanded", "true");
  const after = await geometry(page);
  expect(after.y - before.y).toBeCloseTo(144, 0);
  expect(after.height).toBeCloseTo(before.height, 0);
  expect(await page.evaluate(() => Reflect.get(window, "timelineScrollCalls"))).toEqual([]);
  await expectVisibleSelection(page);
  await page.screenshot({ path: testInfo.outputPath("joined-next.png") });
});

async function expectVisibleSelection(page: Page) {
  const bounds = await current(page).evaluate((el) => {
    const feature = el.querySelector('[data-timeline-expanded]')!.getBoundingClientRect();
    const day = el.querySelector('[data-date-control] strong')!.getBoundingClientRect();
    const marker = el.closest('[role="region"]')!.querySelector('[data-timeline-marker]')!.getBoundingClientRect();
    const header = el.closest('[data-view]')!.querySelector('header')!.getBoundingClientRect();
    return { top: feature.top, bottom: feature.bottom, header: header.bottom, height: innerHeight,
      markerCenter: marker.top + marker.height / 2, dayCenter: day.top + day.height / 2 };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(bounds.header + 27);
  expect(bounds.bottom).toBeLessThan(bounds.height);
  expect(Math.abs(bounds.markerCenter - bounds.dayCenter)).toBeLessThan(2);
}

test("one moderate wheel movement activates a neighbor and reverses immediately", async ({ page }) => {
  await pointAtPhoto(page);
  const start = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 144);
  await expect.poll(() => weight(page, 23)).toBe(1);
  await expect(date(page, 23)).toHaveAttribute("aria-expanded", "true");
  // No transition timeout or quiet interval precedes the reversal.
  await page.mouse.wheel(0, -144);
  await expect.poll(() => weight(page, 21)).toBe(1);
  await expect(date(page, 21)).toHaveAttribute("aria-expanded", "true");
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(start, 0);
  await page.mouse.wheel(0, -144);
  await expect(date(page, 20)).toHaveAttribute("aria-expanded", "true");
});

test("trackpad deltas preserve visible momentum and reverse from a partial transition", async ({ page }) => {
  await pointAtPhoto(page);
  const start = await page.evaluate(() => scrollY);
  for (const delta of [12, 16, 18, 18, 16]) await page.mouse.wheel(0, delta);
  await expect(date(page, 23)).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(start + 80);
  const intermediate = await weight(page, 23);
  expect(intermediate).toBeGreaterThan(.5);
  expect(intermediate).toBeLessThan(1);
  for (const delta of [-12, -18, -20, -30]) await page.mouse.wheel(0, delta);
  await expect.poll(() => weight(page, 21)).toBe(1);
  expect(await page.evaluate(() => scrollY)).toBe(start);
  for (const delta of [38, 30, 26, 20, 14, 10, 6]) await page.mouse.wheel(0, delta);
  await expect.poll(() => weight(page, 23)).toBe(1);
  expect(await page.evaluate(() => scrollY)).toBe(start + 144);
});

test("fast scrolling follows distance rather than skipping or waiting on locks", async ({ page }) => {
  await pointAtPhoto(page);
  const before = await geometry(page);
  await page.mouse.wheel(0, 368);
  await expect.poll(() => weight(page, 25)).toBe(1);
  await expect(date(page, 25)).toHaveAttribute("aria-expanded", "true");
  expect((await geometry(page)).documentHeight).toBe(before.documentHeight);
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(before.y + 368, 0);
  await page.mouse.wheel(0, -112);
  await expect.poll(() => weight(page, 24)).toBe(1);
  await expect(date(page, 24)).toHaveAttribute("aria-expanded", "true");
});

test("native input immediately takes over an unfinished keyboard seek", async ({ page }) => {
  // Hold the smooth request at its starting position so slow browser commands
  // cannot finish the seek before the wheel arrives. Native wheel input and
  // the application's instant cancellation still use the real scroll API.
  await page.evaluate(() => {
    const original = window.scrollTo.bind(window);
    const calls: (ScrollToOptions & { from: number })[] = [];
    Object.defineProperty(window, "timelineSeekCalls", { value: calls });
    Object.defineProperty(window, "scrollTo", { value: (options: ScrollToOptions | number, y?: number) => {
      if (typeof options === "number") return original(options, y ?? 0);
      calls.push({ ...options, from: window.scrollY });
      if (options.behavior !== "smooth") original(options);
    } });
  });
  await date(page, 21).focus();
  const before = await page.evaluate(() => scrollY);
  await page.keyboard.press("End");
  await expect(date(page, 25)).toHaveAttribute("aria-expanded", "true");
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await page.mouse.move(900, 300);
  await page.mouse.wheel(0, -40);
  await expect(date(page, 25)).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(before - 40, 0);
  const calls = await page.evaluate(() => Reflect.get(window, "timelineSeekCalls"));
  expect(calls).toEqual([
    { top: expect.any(Number), behavior: "smooth", from: before },
    { top: expect.any(Number), behavior: "instant", from: expect.any(Number) },
  ]);
  // Passive wheel delivery can run after native movement; cancellation must
  // preserve the position at delivery, whichever order the browser uses.
  expect(calls[1].top).toBe(calls[1].from);
  const afterInput = await page.evaluate(() => scrollY);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(afterInput, 0);
});

test("small native scroll noise does not change the selected session", async ({ page }) => {
  await pointAtPhoto(page);
  for (const delta of [1, 2, -1, 2]) await page.mouse.wheel(0, delta);
  await expect.poll(() => weight(page, 21)).toBeLessThan(1);
  await expect(date(page, 21)).toHaveAttribute("aria-expanded", "true");
});

test("scrollbar-style position changes activate sessions without wheel input", async ({ page }) => {
  const start = await page.evaluate(() => scrollY);
  // The scrolling element's position is also the input from scrollbar dragging;
  // this exercises that path independently of wheel listeners and delta units.
  await page.evaluate((top) => { document.scrollingElement!.scrollTop = top + 256; }, start);
  await expect.poll(() => weight(page, 24)).toBe(1);
  await expect(date(page, 24)).toHaveAttribute("aria-expanded", "true");
  await page.evaluate((top) => { document.scrollingElement!.scrollTop = top; }, start);
  await expect.poll(() => weight(page, 21)).toBe(1);
  await expect(date(page, 21)).toHaveAttribute("aria-expanded", "true");
});

test("first and last sessions preserve native boundary scrolling", async ({ page }) => {
  await page.locator("main").evaluate((main) => {
    const footer = document.createElement("div");
    footer.style.height = "1000px";
    main.append(footer);
  });
  await goToDate(page, 3);
  await pointAtPhoto(page);
  await page.mouse.wheel(0, 30);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(20);
  await page.mouse.wheel(0, -80);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(date(page, 3)).toHaveAttribute("aria-expanded", "true");
  // Reach the distant endpoint with the keyboard rather than asking the browser
  // to auto-scroll an offscreen date under the pinned header before clicking it.
  await date(page, 3).evaluate((button) => button.focus({ preventScroll: true }));
  await page.keyboard.press("End");
  await expect.poll(() => weight(page, 25)).toBe(1);
  await goToDate(page, 25);
  await pointAtPhoto(page);
  const before = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 90);
  await expect(date(page, 25)).toHaveAttribute("aria-expanded", "true");
  await page.mouse.wheel(0, -212);
  await expect.poll(() => weight(page, 24)).toBe(1);
});

test("nested scrollers and an open dialog retain their own scrolling", async ({ page }) => {
  await pointAtPhoto(page);
  await page.mouse.wheel(0, 40);
  await expect.poll(() => weight(page, 21)).toBeLessThan(.9);
  const partial = await weight(page, 21);
  await current(page).evaluate((el) => {
    const scroller = document.createElement("div");
    scroller.setAttribute("data-test-scroller", "");
    scroller.style.cssText = "position:absolute;z-index:2;left:200px;top:100px;width:200px;height:100px;overflow:auto;overscroll-behavior:contain;background:white";
    scroller.innerHTML = '<div style="height:500px">Nested content</div>';
    el.append(scroller);
  });
  const before = await page.evaluate(() => scrollY);
  const scroller = page.locator("[data-test-scroller]");
  await scroller.hover();
  await page.mouse.wheel(0, 100);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await expect(date(page, 21)).toHaveAttribute("aria-expanded", "true");
  await page.evaluate(() => {
    const dialog = document.createElement("dialog");
    dialog.innerHTML = '<div style="height:1500px">Session details</div>';
    dialog.style.cssText = "height:300px;width:400px;overflow:auto";
    document.body.append(dialog);
    dialog.showModal();
  });
  await page.getByRole("dialog").hover();
  await page.mouse.wheel(0, 100);
  await expect.poll(() => page.getByRole("dialog").evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(date(page, 21)).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("dialog").evaluate((el) => { if (el instanceof HTMLDialogElement) el.close(); el.remove(); });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate(() => scrollY)).toBe(before);
  expect(await weight(page, 21)).toBe(partial);
});

test("keyboard, date and collapsed-row navigation still select the intended session", async ({ page }) => {
  await date(page, 21).focus();
  await page.keyboard.press("ArrowDown");
  await expect(date(page, 23)).toBeFocused();
  await expect.poll(() => weight(page, 23)).toBe(1);
  await page.keyboard.press("PageUp");
  await expect(date(page, 21)).toBeFocused();
  await expect.poll(() => weight(page, 21)).toBe(1);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(date(page, 24)).toBeFocused();
  await expect.poll(() => weight(page, 24)).toBe(1);
  await page.keyboard.press("Home");
  await expect.poll(() => weight(page, 3)).toBe(1);
  await page.keyboard.press("End");
  await expect.poll(() => weight(page, 25)).toBe(1);
  await goToDate(page, 21);
  // Click a visible neighboring row. Auto-scrolling to an offscreen previous
  // row itself activates it, so its former collapsed button no longer exists.
  await row(page, 23).getByRole("button", { name: "Expand Tennis Court Booking at Bishan Tennis Centre" }).click();
  await expect.poll(() => weight(page, 23)).toBe(1);
  await expect(date(page, 23)).toHaveAttribute("aria-expanded", "true");
});

test("reduced motion keeps native scrolling and synchronized marker and date", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await pointAtPhoto(page);
  await page.mouse.wheel(0, 144);
  await expect.poll(() => weight(page, 23)).toBe(1);
  await expectVisibleSelection(page);
  expect(await timeline(page).evaluate((el) => el.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running").length)).toBe(0);
});

test("narrow desktop and tall viewports preserve moderate native progression", async ({ page }) => {
  for (const viewport of [{ width: 820, height: 900 }, { width: 1440, height: 1800 }]) {
    await page.setViewportSize(viewport);
    await goToDate(page, 21);
    await pointAtPhoto(page);
    const before = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 144);
    await expect.poll(() => weight(page, 23)).toBe(1);
    expect(await page.evaluate(() => scrollY)).toBeCloseTo(before + 144, 0);
  }
});

test("mobile Joined keeps its native list scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(timeline(page)).toBeHidden();
  await page.evaluate(() => scrollTo(0, 0));
  await page.getByRole("list", { name: "Joined sessions" }).getByRole("button").first().hover();
  await page.mouse.wheel(0, 150);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
});
