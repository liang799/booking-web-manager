import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import HelpPage from "@/app/profile/help/page";
import ProfilePage from "@/app/profile/page";
import { getCurrentUser } from "@/lib/supabase/current-user";

vi.mock("@/lib/supabase/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/app/commit/_components/push-notifications-row", () => ({ PushNotificationsRow: () => null }));

const user = {
  id: "viewer", email: "viewer@example.com", emailVerified: true, accountStatus: "ACTIVE" as const,
  pendingEmail: null, displayName: "Viewer", profileName: "Viewer", preferredSports: [], preferredRegions: [], reliabilityScore: 100,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue(user);
});

test("every Settings row opens a page; none is left as coming soon", async () => {
  const html = renderToStaticMarkup(await ProfilePage());

  for (const href of ["/privacy", "/profile/help", "/terms"]) expect(html).toContain(`href="${href}"`);
  expect(html).not.toContain("Coming soon");
});

test("help answers link to the pages they mention", () => {
  const html = renderToStaticMarkup(createElement(HelpPage));

  for (const href of ["/discover", "/wallet", "/profile", "/profile/email", "/profile/delete", "/terms", "/privacy"]) {
    expect(html).toContain(`href="${href}"`);
  }
  expect(html).toContain("<details");
  expect(html).toContain("72 hours after the session ends");
});
