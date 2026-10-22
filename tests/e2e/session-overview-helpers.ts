import { expect, type Page } from "@playwright/test";

/** Opens a visible hosted card in either the mobile list or desktop carousel. */
export async function openHostedSession(page: Page, venueName: string) {
  await page.getByRole("main").getByRole("button").filter({ hasText: venueName }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: /^(Manage|View) participants$/ })).toBeVisible();
  return dialog;
}
