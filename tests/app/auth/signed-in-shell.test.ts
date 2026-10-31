import { beforeEach, expect, test, vi } from "vitest";
import { SignedInShell } from "@/app/(auth)/_components/signed-in-shell";
import { loadReliabilityScore } from "@/app/profile/reliability";
import { NotificationProvider } from "@/app/notifications/provider";
import { AppShell } from "@/components/ui/app-shell";
import { getCurrentUser } from "@/lib/supabase/current-user";

vi.mock("@/lib/supabase/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/app/profile/reliability", () => ({ loadReliabilityScore: vi.fn() }));
vi.mock("@/app/(auth)/logout-action", () => ({ logOut: vi.fn() }));
vi.mock("@/app/(auth)/_components/signed-in-verification-prompt", () => ({ SignedInVerificationPrompt: () => null }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

const user = {
  id: "viewer", email: "viewer@example.com", emailVerified: true, accountStatus: "ACTIVE" as const,
  pendingEmail: null, displayName: "Viewer", profileName: "Viewer", preferredSports: [], preferredRegions: [], reliabilityScore: 100,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue(user);
});

test("the sidebar shows the score calculated from the user's history", async () => {
  // Arrange
  vi.mocked(loadReliabilityScore).mockResolvedValue(66.5);

  // Act
  const shell = await SignedInShell({ children: "Page" });

  // Assert
  expect(shell.type).toBe(NotificationProvider);
  expect(shell.props.userId).toBe("viewer");
  expect(shell.props.children.type).toBe(AppShell);
  expect(shell.props.children.props.user).toEqual({ name: "Viewer", reliabilityScore: 66.5 });
  expect(loadReliabilityScore).toHaveBeenCalledExactlyOnceWith("viewer");
});

test("the sidebar is told the score is unavailable instead of using the starting score", async () => {
  // Arrange
  vi.mocked(loadReliabilityScore).mockResolvedValue(null);

  // Act
  const shell = await SignedInShell({ children: "Page" });

  // Assert
  expect(shell.props.children.props.user).toEqual({ name: "Viewer", reliabilityScore: null });
});
