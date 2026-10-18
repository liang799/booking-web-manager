import { expect, test, type Locator, type Page } from "@playwright/test";

function pressTab(page: Page, backwards = false) {
  // macOS Safari uses Option+Tab to include links in keyboard navigation.
  const option = process.platform === "darwin" && page.context().browser()?.browserType().name() === "webkit" ? "Alt+" : "";
  return page.keyboard.press(`${option}${backwards ? "Shift+" : ""}Tab`);
}

async function captureSectionScroll(page: Page, link: Locator) {
  const trace = await page.evaluateHandle(() => {
    const result = { positions: [] as number[], complete: false };
    document.addEventListener("click", () => {
      result.positions.push(window.scrollY);
      let frames = 0;
      let stationaryFrames = 0;
      function sample() {
        const position = window.scrollY;
        stationaryFrames = position === result.positions.at(-1) ? stationaryFrames + 1 : 0;
        result.positions.push(position);
        if (++frames >= 180 || (frames > 6 && stationaryFrames >= 4)) result.complete = true;
        else window.requestAnimationFrame(sample);
      }
      window.requestAnimationFrame(sample);
    }, { capture: true, once: true });
    return result;
  });

  await link.click();
  await expect.poll(() => trace.evaluate((result) => result.complete)).toBe(true);
  const positions = await trace.evaluate((result) => result.positions);
  await trace.dispose();
  return positions;
}

test("landing navigation stays usable without horizontal overflow on mobile, tablet, and desktop", async ({ page }) => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

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

    await pressTab(page);
    await expect(page.getByRole("link", { name: "Skip to content", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#landing-content")).toBeFocused();
    await pressTab(page);
    await expect(page.getByRole("link", { name: "Browse sessions", exact: true })).toBeFocused();
  }
});

test("the mobile disclosure supports keyboard navigation and all dismissal paths", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.locator('summary[aria-controls="landing-mobile-navigation"]');
  const panel = page.locator("#landing-mobile-navigation");
  const navigation = page.getByRole("navigation", { name: "Mobile navigation", exact: true });

  await expect(panel).toBeHidden();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAccessibleName("Close navigation menu");
  await expect(navigation).toBeVisible();
  await expect(trigger).toBeFocused();
  await pressTab(page);
  await expect(navigation.getByRole("link", { name: "Discover sessions", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAccessibleName("Open navigation menu");
  await expect(panel).toBeHidden();

  await page.keyboard.press("Space");
  await expect(navigation).toBeVisible();
  for (const [name, href] of [
    ["Discover sessions", "/discover"],
    ["Find your sport", "#sports"],
    ["How it works", "#how-it-works"],
    ["Host a session", "/sessions/create"],
    ["Get started", "/register"],
    ["Sign in", "/login"],
  ] as const) {
    await pressTab(page);
    const link = navigation.getByRole("link", { name, exact: true });
    await expect(link).toBeFocused();
    await expect(link).toHaveAttribute("href", href);
  }
  await pressTab(page);
  await expect(page.getByRole("link", { name: "Browse sessions", exact: true })).toBeFocused();
  await expect(panel).toBeHidden();

  await trigger.click();
  await pressTab(page, true);
  await expect(page.getByRole("link", { name: "Booking home", exact: true })).toBeFocused();
  await expect(panel).toBeHidden();

  await trigger.click();
  await page.getByRole("list", { name: "What you can do with Booking", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(trigger).toHaveAccessibleName("Open navigation menu");
});

test("rapid mobile toggles recover and resizing to desktop closes the disclosure", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.locator('summary[aria-controls="landing-mobile-navigation"]');
  const panel = page.locator("#landing-mobile-navigation");

  await trigger.click();
  await trigger.click();
  await trigger.click();
  await expect(trigger).toHaveAccessibleName("Close navigation menu");
  await expect.poll(() => panel.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  await expect(panel).not.toHaveAttribute("inert", "");

  await trigger.click();
  await pressTab(page);
  await expect(page.getByRole("link", { name: "Browse sessions", exact: true })).toBeFocused();
  await expect(panel).toBeHidden();

  await trigger.click();
  await pressTab(page);
  await page.setViewportSize({ width: 900, height: 844 });
  await expect(trigger).toBeHidden();
  await expect(panel).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link", { name: "Play", exact: true })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(trigger).toHaveAccessibleName("Open navigation menu");
  await expect(panel).toBeHidden();
});

test("modifier-click opens a section in another tab without dismissing the original menu", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Open navigation menu", { exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Mobile navigation", exact: true });
  const popupPromise = context.waitForEvent("page");
  await navigation.getByRole("link", { name: "Find your sport", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/#sports$/);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel("Close navigation menu", { exact: true })).toBeVisible();
  await expect(navigation).toBeVisible();
  await popup.close();
});

test("pressing a menu link keeps it open through pointer focus transfer until activation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.locator('summary[aria-controls="landing-mobile-navigation"]');
  await trigger.click();
  const navigation = page.getByRole("navigation", { name: "Mobile navigation", exact: true });
  const link = navigation.getByRole("link", { name: "Find your sport", exact: true });
  await link.hover();
  await trigger.focus();
  const bounds = await link.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  try {
    // Safari blurs the summary to the document; Chromium focuses the link.
    await expect(trigger).not.toBeFocused();
    await expect(trigger).toHaveAccessibleName("Close navigation menu");
    await expect(navigation).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  } finally {
    await page.mouse.up();
  }
  await expect(page).toHaveURL(/\/#sports$/);
  await expect(page.locator("#sports")).toBeFocused();
  await expect(page.locator("#sports")).toBeInViewport();
  await expect(page.locator("#landing-mobile-navigation")).toBeHidden();
});

test.describe("touch navigation", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("tapping the disclosure preserves trigger focus and activates section links", async ({ page }) => {
    await page.goto("/");
    const trigger = page.locator('summary[aria-controls="landing-mobile-navigation"]');
    const panel = page.locator("#landing-mobile-navigation");
    await trigger.tap();
    await expect(trigger).toHaveAccessibleName("Close navigation menu");
    await trigger.tap();
    await expect(trigger).toHaveAccessibleName("Open navigation menu");
    await expect(trigger).toBeFocused();
    await expect(panel).toBeHidden();

    await trigger.tap();
    const navigation = page.getByRole("navigation", { name: "Mobile navigation", exact: true });
    await navigation.getByRole("link", { name: "Find your sport", exact: true }).tap();
    await expect(page).toHaveURL(/\/#sports$/);
    await expect(page.locator("#sports")).toBeFocused();
    await expect(page.locator("#sports")).toBeInViewport();
    await expect(panel).toBeHidden();
  });
});

test("mobile menu actions remain reachable on narrow and short screens", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 600, height: 320 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByLabel("Open navigation menu", { exact: true }).click();
    const navigation = page.getByRole("navigation", { name: "Mobile navigation", exact: true });
    const signIn = navigation.getByRole("link", { name: "Sign in", exact: true });
    await signIn.scrollIntoViewIfNeeded();
    await expect(signIn).toBeInViewport();
    const bounds = await navigation.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(navigation).toBeHidden();
  }
});

for (const source of ["mobile menu", "page sections", "desktop navigation"] as const) {
  test(`${source} smoothly scrolls to the section, moves focus, and preserves browser history`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: source === "desktop navigation" ? 1440 : 390, height: 844 });
    await page.goto("/");
    if (source === "mobile menu") await page.getByLabel("Open navigation menu", { exact: true }).click();
    const navigation = page.getByRole("navigation", {
      name: source === "mobile menu" ? "Mobile navigation" : source === "page sections" ? "Page sections" : "Main navigation",
      exact: true,
    });
    const link = navigation.getByRole("link", {
      name: source === "mobile menu" ? "Find your sport" : source === "page sections" ? "02 — Find your sport" : "Discover",
      exact: true,
    });
    const positions = await captureSectionScroll(page, link);
    const start = positions[0]!;
    const finish = positions.at(-1)!;
    expect(finish).toBeGreaterThan(start + 100);
    expect(positions.some((position) => position > start + 1 && position < finish - 1)).toBe(true);
    await expect(page).toHaveURL(/\/#sports$/);
    await expect(page.locator("#sports")).toBeFocused();
    await expect(page.locator("#sports")).toBeInViewport();
    const bounds = await page.locator("#sports").boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(-1);
    expect(bounds!.y).toBeLessThanOrEqual(80);
    if (source === "mobile menu") await expect(page.locator("#landing-mobile-navigation")).toBeHidden();

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.goForward();
    await expect(page).toHaveURL(/\/#sports$/);
    await expect(page.locator("#sports")).toBeInViewport();
  });
}

test("reduced motion skips scrolling animation while keeping section focus and menu dismissal", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Open navigation menu", { exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Mobile navigation", exact: true });
  const positions = await captureSectionScroll(page, navigation.getByRole("link", { name: "How it works", exact: true }));
  const start = positions[0]!;
  const finish = positions.at(-1)!;
  expect(finish).toBeGreaterThan(start + 100);
  expect(positions.some((position) => position > start + 1 && position < finish - 1)).toBe(false);
  await expect(page).toHaveURL(/\/#how-it-works$/);
  await expect(page.locator("#how-it-works")).toBeFocused();
  await expect(page.locator("#how-it-works")).toBeInViewport();
  await expect(page.locator("#landing-mobile-navigation")).toBeHidden();
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
      const sectionNavigation = page.getByRole("navigation", { name: isMobile ? "Mobile navigation" : "Main navigation", exact: true });
      // Let the native CSS reveal settle before clicking with page scripts disabled.
      await expect.poll(() => sectionNavigation.evaluate((element) => element.getAnimations({ subtree: true }).some((animation) => animation.playState === "running"))).toBe(false);
      await sectionNavigation.getByRole("link", { name: "How it works", exact: true }).click();
      await expect(page).toHaveURL(/\/#how-it-works$/);
      await expect(page.locator("#how-it-works")).toBeInViewport();
      if (isMobile) await mobileMenu.click();
      await page.getByRole("link", { name: "Browse sessions", exact: true }).click();
      await expect(page).toHaveURL(/\/discover$/);
      await expect(page.getByRole("heading", { name: "Find Your Next Game", exact: true })).toBeVisible();
    }
  });
});
