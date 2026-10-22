import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { sessionTestContext, type SessionTestContext } from "../support/session-test-context";

async function login(page: Page, identity: Awaited<ReturnType<SessionTestContext["identity"]>>) {
  await page.goto("/login?next=%2Fsessions");
  await page.getByLabel("Email", { exact: true }).fill(identity.email);
  await page.getByLabel("Password", { exact: true }).fill(identity.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/sessions$/);
}

test("Wallet links open the wallet inside account navigation on mobile and desktop", async ({ page }, testInfo) => {
  const context = sessionTestContext();
  try {
    const identity = await context.identity(false);
    await login(page, identity);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Wallet", exact: true }).click();
      await expect(page).toHaveURL(/\/wallet$/);
      await expect(page.getByRole("heading", { name: "Wallet", exact: true })).toBeVisible();
      const transactions = page.getByRole("region", { name: "Transactions", exact: true });
      await expect(transactions.getByText("No transactions yet", { exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: "Balance", exact: true }).getByRole("button", { name: "Add funds", exact: true })).toBeVisible();
      const activityHeading = transactions.getByRole("heading", { name: "Recent activity", exact: true });
      const sections = transactions.getByRole("navigation", { name: "Wallet sections", exact: true });
      if (width < 768) {
        await expect(activityHeading).toBeVisible();
        await expect(sections).toBeHidden();
      } else {
        await expect(sections.getByRole("link", { name: "All transactions", exact: true })).toBeVisible();
        await expect(activityHeading).toBeHidden();
      }
      await expect(page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Wallet", exact: true })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("main")).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`wallet-${width}.png`), fullPage: true });
    }
    // Transaction history in Settings opens the same wallet page.
    await page.goto("/profile");
    await page.getByRole("link", { name: /Transaction history/ }).click();
    await expect(page).toHaveURL(/\/wallet$/);
    await expect(page.getByRole("region", { name: "Transactions", exact: true }).getByText("No transactions yet", { exact: true })).toBeVisible();
  } finally { await context.pool.end(); }
});

test("unknown routes and missing groups show one signed-in shell with usable exits", async ({ page }, testInfo) => {
  const context = sessionTestContext();
  try {
    const identity = await context.identity(false);
    await login(page, identity);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const response = await page.goto(`/missing-${randomUUID()}`);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Main", exact: true })).toHaveCount(1);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("link", { name: "Back to Home", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`not-found-${width}.png`), fullPage: true });
      await page.getByRole("link", { name: "View my sessions", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Sessions", exact: true })).toBeVisible();
    }
    await page.goto(`/groups/${randomUUID()}`);
    await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main", exact: true })).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Log in", exact: true })).toBeVisible();
    await page.goto("/wallet");
    await expect(page).toHaveURL(/\/login\?next=%2Fwallet$/);
    const response = await page.goto("/missing-after-logout");
    expect(response?.status()).toBe(404);
    await expect(page).toHaveURL(/\/missing-after-logout$/);
    await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main", exact: true })).toHaveCount(0);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "View my sessions", exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Back to Home", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Log in", exact: true })).toBeVisible();
  } finally { await context.pool.end(); }
});
