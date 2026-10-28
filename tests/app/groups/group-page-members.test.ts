import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import GroupPage from "@/app/groups/[groupId]/page";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { memberProfiles } from "@/lib/supabase/profile-names";

const GROUP_ID = "6f1c2a7e-4b8d-4c1e-9a3f-2d5b7c9e1f03";
const mocks = vi.hoisted(() => ({ viewAsMember: vi.fn() }));
vi.mock("@/lib/supabase/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/supabase/profile-names", () => ({ memberProfiles: vi.fn() }));
vi.mock("@/use-case-config/groups", () => ({ createManageGroup: () => ({ viewAsMember: mocks.viewAsMember }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "app.test", "x-forwarded-proto": "https" }) }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("not-found"); },
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));
// The owner controls are client components with their own tests; this page test covers the member list.
vi.mock("@/app/groups/_components/group-controls", () => {
  const none = () => null;
  return { ArchiveGroupButton: none, InvitationControls: none, InvitationLink: none, LeaveGroupButton: none, RemoveMemberButton: none, RenameGroupForm: none };
});

const joinedAt = new Date("2026-10-12T10:00:00+08:00");

// Owner: Joseph (Jolingoes) — /app/groups (UC1-06, ADR-0021)
describe("group page member list", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "owner", email: "owner@example.com", emailVerified: true, pendingEmail: null, accountStatus: "ACTIVE",
      displayName: "Owner", profileName: "Owner", handle: "the_owner", preferredSports: [], preferredRegions: [], reliabilityScore: 100,
    });
    mocks.viewAsMember.mockResolvedValue({
      groupId: GROUP_ID, name: "Friday Badminton", status: "ACTIVE", ownerId: "owner", invitationActive: true, invitationToken: "token",
      memberships: [{ userId: "owner", joinedAt }, { userId: "marcus", joinedAt }, { userId: "gone", joinedAt }],
    });
    vi.mocked(memberProfiles).mockResolvedValue(new Map([
      ["owner", { name: "Owner", handle: "the_owner" }],
      ["marcus", { name: "Marcus Lim", handle: "marcus_lim" }],
      ["gone", { name: "Deleted user", handle: null }],
    ]));
  });

  test("shows each active member's user ID before their join date", async () => {
    // Act
    const html = renderToStaticMarkup(await GroupPage({ params: Promise.resolve({ groupId: GROUP_ID }) }));

    // Assert
    expect(html).toContain("Marcus Lim");
    expect(html).toContain("@marcus_lim · Joined 12 Oct 2026");
    expect(html).toContain("@the_owner · Joined 12 Oct 2026");
    expect(memberProfiles).toHaveBeenCalledExactlyOnceWith(["owner", "marcus", "gone"]);
  });

  test("shows no user ID for a deleted member", async () => {
    // Act
    const html = renderToStaticMarkup(await GroupPage({ params: Promise.resolve({ groupId: GROUP_ID }) }));

    // Assert
    const deletedRow = html.slice(html.indexOf("Deleted user"));
    expect(deletedRow.slice(0, deletedRow.indexOf("</li>"))).not.toContain("@");
  });
});
