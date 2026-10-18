import { expect, test, type Locator, type Page } from "@playwright/test";

async function ballPosition(ball: Locator) {
  return ball.evaluate((element) => {
    const matrix = element instanceof SVGGraphicsElement ? element.getCTM() : null;
    return matrix ? { x: matrix.e, y: matrix.f } : null;
  });
}

async function expectBallToMove(ball: Locator) {
  const initialPosition = await ballPosition(ball);
  expect(initialPosition).not.toBeNull();
  await expect.poll(() => ballPosition(ball)).not.toEqual(initialPosition);
}

async function expectCourtToStayStill(page: Page, host: Locator) {
  const court = host.getByTestId("host-court");
  const ball = host.getByTestId("court-ball");
  await expect.poll(() => court.evaluate((element) => element.getAnimations({ subtree: true })
    .every((animation) => !animation.pending && (animation.playState === "paused" || animation.playState === "finished")))).toBe(true);
  const initialPosition = await ballPosition(ball);
  expect(initialPosition).not.toBeNull();
  // Sample over time rather than waiting for page callbacks, which are disabled in the no-JS context.
  await page.waitForTimeout(120);
  expect(await ballPosition(ball)).toEqual(initialPosition);
}

test("landing navigation stays usable without horizontal overflow on mobile, tablet, and desktop", async ({ page }) => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Find your next game.", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse sessions", exact: true })).toHaveAttribute("href", "/discover");
    const mobileMenu = page.getByLabel("Open navigation menu", { exact: true });
    const isMobile = await mobileMenu.isVisible();
    if (isMobile) await mobileMenu.click();
    await expect(page.getByRole("link", { name: isMobile ? "Sign in" : "Log in", exact: true })).toHaveAttribute("href", "/login");
    await expect(page.getByRole("link", { name: "Create account", exact: true })).toHaveAttribute("href", "/register");
    await expect(page.locator('a[href="/sessions/create"]:visible').first()).toBeVisible();
    await expect(page.locator('a[href="/discover?sport=Tennis"]').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.getByRole("link", { name: "How it works", exact: true }).click();
    await expect(page).toHaveURL(/\/#how-it-works$/);
    await expect(page.locator("#how-it-works")).toBeInViewport();
  }

  await page.locator('a[href="/discover?sport=Tennis"]').first().click();
  await expect(page).toHaveURL(/\/discover\?sport=Tennis$/);
  await expect(page.getByRole("heading", { name: "Find Your Next Game", exact: true })).toBeVisible();
});

test("the keyboard skip link moves past navigation to the primary action", async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#landing-content")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Browse sessions", exact: true })).toBeFocused();
  }
});

test("the hero action and practical details do not overlap at short and wide desktop sizes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1599, height: 768 }, { width: 1920, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const action = page.getByRole("link", { name: "Browse sessions", exact: true });
    const facts = page.getByRole("list", { name: "What you can do with Booking", exact: true });
    await expect(action).toBeVisible();
    await expect(facts).toBeVisible();
    const actionBounds = await action.boundingBox();
    const factsBounds = await facts.boundingBox();
    expect(actionBounds).not.toBeNull();
    expect(factsBounds).not.toBeNull();
    expect(actionBounds!.y + actionBounds!.height, `Hero action overlaps practical details at ${viewport.width}×${viewport.height}`).toBeLessThanOrEqual(factsBounds!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("the hero loads the intended mobile and desktop artwork", async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");

    const artwork = page.getByRole("region", { name: "Find your next game.", exact: true }).locator("picture img");
    await expect(artwork).toBeVisible();
    await expect.poll(() => artwork.evaluate((image) => image instanceof HTMLImageElement ? image.naturalWidth : 0)).toBeGreaterThan(0);
    const source = await artwork.evaluate((image) => image instanceof HTMLImageElement ? image.currentSrc : "");
    expect(new URL(source).pathname).toBe(width < 700 ? "/images/landing-court-mobile.webp" : "/images/landing-court.webp");
  }
});

test.describe("host court motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the court runs while visible and preserves a manual pause across scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const host = page.locator("#host");
    const ball = host.getByTestId("court-ball");
    await expect(host).toHaveAttribute("data-enhanced", "true");
    await expect(host).not.toBeInViewport();
    await expect(host).toHaveAttribute("data-motion", "paused");

    await host.scrollIntoViewIfNeeded();
    await expect(host).toHaveAttribute("data-revealed", "true");
    await expect(host).toHaveAttribute("data-motion", "running");
    await expect(host.getByRole("heading", { name: "Got a court? Make it a game.", exact: true })).toBeVisible();
    await expect(host.getByRole("link", { name: "Host a session", exact: true })).toHaveAttribute("href", "/sessions/create");
    await expect(host.getByTestId("host-court")).toHaveAttribute("aria-hidden", "true");
    await expectBallToMove(ball);

    await page.getByRole("heading", { name: "Find your next game.", exact: true }).scrollIntoViewIfNeeded();
    await expect(host).not.toBeInViewport();
    await expect(host).toHaveAttribute("data-motion", "paused");
    await expectCourtToStayStill(page, host);
    await host.scrollIntoViewIfNeeded();
    await expect(host).toHaveAttribute("data-motion", "running");

    await host.getByRole("button", { name: "Pause court animation", exact: true }).click();
    const play = host.getByRole("button", { name: "Play court animation", exact: true });
    await expect(play).toHaveAttribute("aria-pressed", "true");
    await expect(host).toHaveAttribute("data-motion", "paused");
    await expectCourtToStayStill(page, host);
    await page.getByRole("heading", { name: "Find your next game.", exact: true }).scrollIntoViewIfNeeded();
    await expect(host).not.toBeInViewport();
    await host.scrollIntoViewIfNeeded();
    await expect(host).toHaveAttribute("data-motion", "paused");
    await expect(play).toHaveAttribute("aria-pressed", "true");
    await expectCourtToStayStill(page, host);

    await play.click();
    await expect(host.getByRole("button", { name: "Pause court animation", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(host).toHaveAttribute("data-motion", "running");
    await expectBallToMove(ball);
  });

  test("the court pauses when the document becomes hidden", async ({ page }) => {
    await page.goto("/");
    const host = page.locator("#host");
    const ball = host.getByTestId("court-ball");
    await host.scrollIntoViewIfNeeded();
    await expect(host).toHaveAttribute("data-motion", "running");

    // Headless pages remain foregrounded, so deliver the browser visibility event explicitly.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(host).toHaveAttribute("data-motion", "paused");
    await expectCourtToStayStill(page, host);

    await page.evaluate(() => {
      Reflect.deleteProperty(document, "visibilityState");
      Reflect.deleteProperty(document, "hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(host).toHaveAttribute("data-motion", "running");
    await expectBallToMove(ball);
  });

  test("reduced motion keeps the court static and responds to preference changes", async ({ page }) => {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");

      const host = page.locator("#host");
      const ball = host.getByTestId("court-ball");
      const control = host.getByRole("button", { name: /^(Pause|Play) court animation$/, includeHidden: true });
      await host.scrollIntoViewIfNeeded();
      await expect(host).toHaveAttribute("data-enhanced", "true");
      await expect(host).toHaveAttribute("data-motion", "paused");
      await expect(host.getByRole("heading", { name: "Got a court? Make it a game.", exact: true })).toBeVisible();
      await expect(host.getByRole("link", { name: "Host a session", exact: true })).toBeVisible();
      await expect(control).toBeHidden();
      await expectCourtToStayStill(page, host);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect(host).toHaveAttribute("data-motion", "running");
      await expect(control).toBeVisible();
      await expectBallToMove(ball);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(host).toHaveAttribute("data-motion", "paused");
      await expect(control).toBeHidden();
      await expectCourtToStayStill(page, host);
    }
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the landing copy and primary discovery link remain usable", async ({ page }) => {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/", { waitUntil: "domcontentloaded" });

      await expect(page.getByRole("heading", { name: "Find your next game.", exact: true })).toBeVisible();
      const mobileMenu = page.getByLabel("Open navigation menu", { exact: true });
      const isMobile = await mobileMenu.isVisible();
      if (isMobile) await mobileMenu.click();
      await expect(page.getByRole("link", { name: isMobile ? "Sign in" : "Log in", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Create account", exact: true })).toBeVisible();
      if (isMobile) await mobileMenu.click();
      await page.getByRole("link", { name: "Browse sessions", exact: true }).click();
      await expect(page).toHaveURL(/\/discover$/);
      await expect(page.getByRole("heading", { name: "Find Your Next Game", exact: true })).toBeVisible();
    }
  });

  test("the host copy, court and hosting link remain usable without motion controls", async ({ page }) => {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/", { waitUntil: "domcontentloaded" });

      const host = page.locator("#host");
      await host.scrollIntoViewIfNeeded();
      await expect(host).not.toHaveAttribute("data-enhanced", "true");
      await expect(host.getByRole("heading", { name: "Got a court? Make it a game.", exact: true })).toBeVisible();
      await expect(host.getByRole("link", { name: "Host a session", exact: true })).toHaveAttribute("href", "/sessions/create");
      await expect(host.getByTestId("host-court")).toBeVisible();
      await expect(host.getByRole("button", { name: /^(Pause|Play) court animation$/, includeHidden: true })).toBeHidden();
      await expectCourtToStayStill(page, host);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
});
