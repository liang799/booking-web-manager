import { expect, test } from "@playwright/test";

/**
 * Regression for a passing Next/Storybook build whose browser preview still
 * crashed with "Buffer is not defined". Assert actual rendering in Chromium.
 */
test("session participant desktop Storybook renders in the browser", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/storybook/iframe.html?viewMode=story&id=sessions-participant-removal--desktop");
  await expect(page.getByRole("heading", { name: "Badminton Session" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Participants (2)" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("new invitation modals render without server-only dependencies", async ({ page }) => {
  for (const [storyId, title] of [
    ["sessions-player-invitations--invite-by-user-id", "Invite players"],
    ["sessions-player-invitations--import-from-group", "Import from group"],
  ] as const) {
    const errors: string[] = [];
    const onError = (error: Error) => errors.push(error.message);
    page.on("pageerror", onError);
    await page.goto(`/storybook/iframe.html?viewMode=story&id=${storyId}`);
    await expect(page.getByRole("dialog")).toContainText(title);
    expect(errors).toEqual([]);
    page.off("pageerror", onError);
  }
});

test("light mode participant action menu has readable foreground and background", async ({ page }) => {
  await page.goto("/storybook/iframe.html?viewMode=story&id=sessions-participant-removal--light-mode-menu");
  const menuItem = page.getByRole("button", { name: "Remove participant" });
  await expect(menuItem).toBeVisible();
  await expect(menuItem).toHaveCSS("color", "rgb(21, 25, 32)");
  await expect(menuItem.locator("..")).toHaveCSS("background-color", "rgb(255, 255, 255)");
});
