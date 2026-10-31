/**
 * Capture REAL Storybook renders of the group detail redesign for PR visual review.
 * Run after build-storybook, with the static Storybook site served at 127.0.0.1:6006.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const base = "http://127.0.0.1:6006/iframe.html";
const destination = path.resolve("docs/assets/groups/visual-comparison");
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(30000);

async function story(id, heading) {
  await page.goto(base + "?id=" + id + "&viewMode=story", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: heading }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function capture(name) {
  await page.screenshot({ path: path.join(destination, name), fullPage: true, animations: "disabled" });
}

try {
  // Current light- and dark-mode headers, captured from actual Storybook renders.
  await story("groups-details--visual-owner", "Members (4)");
  await capture("after-hero-light.png");
  await story("groups-details--dark", "Members (4)");
  await capture("after-hero-dark.png");
  await capture("after-members.png");

  await page.getByRole("button", { name: "Invite players" }).click();
  await page.getByRole("dialog").getByText("Group invite link").waitFor();
  await capture("after-invite-modal.png");

  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await page.getByRole("tab", { name: "Invitations" }).click();
  await page.getByRole("heading", { name: "No pending invitations" }).waitFor();
  await capture("after-invitations-empty.png");

  await story("groups-details--visual-pending", "Members (4)");
  await page.getByRole("tab", { name: "Invitations" }).click();
  await page.getByRole("heading", { name: "Pending invitations" }).waitFor();
  await capture("after-invitations-pending.png");

  await story("groups-details--visual-owner", "Members (4)");
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("heading", { name: "Group settings" }).waitFor();
  await capture("after-settings.png");
} finally {
  await browser.close();
}
