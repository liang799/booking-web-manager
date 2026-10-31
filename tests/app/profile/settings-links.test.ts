import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import HelpPage from "@/app/profile/help/page";
import ProfilePage from "@/app/profile/page";
import { loadReliabilityScore } from "@/app/profile/reliability";
import { getCurrentUser } from "@/lib/supabase/current-user";

vi.mock("@/lib/supabase/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/app/commit/_components/push-notifications-row", () => ({ PushNotificationsRow: () => "Session notifications" }));
vi.mock("@/app/profile/reliability", () => ({ loadReliabilityScore: vi.fn() }));

const user = {
  id: "viewer", email: "viewer@example.com", emailVerified: true, accountStatus: "ACTIVE" as const,
  pendingEmail: null, displayName: "Viewer", profileName: "Viewer", preferredSports: [], preferredRegions: [], reliabilityScore: 100,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue(user);
  vi.mocked(loadReliabilityScore).mockResolvedValue(96);
});

test("Settings shows the score calculated from the user's history", async () => {
  const html = renderToStaticMarkup(await ProfilePage());

  expect(loadReliabilityScore).toHaveBeenCalledExactlyOnceWith("viewer");
  // The redesigned profile variant separates the score and label for styling.
  expect(html).toMatch(/Reliability <strong[^>]*>4\.8<\/strong>/);
  expect(html).toMatch(/>High<\/span>/);
});

test("Settings says the score is unavailable instead of showing the starting score", async () => {
  vi.mocked(loadReliabilityScore).mockResolvedValue(null);

  const html = renderToStaticMarkup(await ProfilePage());

  expect(html).toContain("Reliability score unavailable right now.");
  expect(html).not.toContain("5.0");
});

test("Settings mounts the merged responsive revamp, real preferences and live notification slot", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue({
    ...user,
    preferredSports: ["Tennis", "Badminton"],
    preferredRegions: ["West"],
  });

  const html = renderToStaticMarkup(await ProfilePage());

  expect(html).toContain("Manage your account, preferences and more.");
  expect(html).toContain("Set your default preferences to get better session recommendations.");
  expect(html).toContain("Tennis, Badminton");
  expect(html).toContain("West");
  expect(html).toContain("Session notifications");
  // Do not invent profile statistics when the read model has no activity totals.
  expect(html).toContain("Not available yet");
  expect(html).not.toContain(">0</dd>");
});

test("every Settings row opens a page; none is left as coming soon", async () => {
  const html = renderToStaticMarkup(await ProfilePage());

  for (const href of ["/privacy", "/profile/help", "/terms"]) expect(html).toContain(`href="${href}"`);
  expect(html).toContain("Log out");
  expect(html).not.toContain("Coming soon");
});

test("help answers link to the pages they mention", () => {
  const html = renderToStaticMarkup(createElement(HelpPage));

  for (const href of ["/discover", "/wallet", "/payouts", "/profile", "/profile/email", "/profile/delete", "/terms", "/privacy"]) {
    expect(html).toContain(`href="${href}"`);
  }
  expect(html).toContain("<details");
  // /profile/email can add or confirm an address, not replace one.
  expect(html).toContain("How do I add or confirm my email address?");
  expect(html).not.toContain("change my email");
  expect(html).toContain("72 hours after the session ends");
  // PayNow top-up is live, so Help must not describe it as upcoming.
  expect(html).toContain("Pay with PayNow");
  expect(html.toLowerCase()).not.toContain("coming soon");
});
