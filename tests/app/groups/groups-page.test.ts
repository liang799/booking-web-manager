import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GroupsPage from "@/app/groups/page";
import { RedirectCalled } from "../../use-cases/support/fake-supabase-auth";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listMine: vi.fn(),
  memberProfiles: vi.fn(),
}));
vi.mock("@/lib/supabase/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/supabase/profile-names", () => ({ memberProfiles: mocks.memberProfiles }));
vi.mock("@/use-case-config/groups", () => ({ createManageGroup: () => ({ listMine: mocks.listMine }) }));
vi.mock("@/app/groups/_components/group-controls", () => ({ CreateGroupForm: () => null }));
vi.mock("@/app/users/find-player-action", () => ({ findPlayer: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new RedirectCalled(path); },
}));

describe("UC1-06 groups overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "owner" });
    mocks.listMine.mockResolvedValue([{
      groupId: "weekend", name: "Weekend Tennis Club", ownerId: "owner", status: "ACTIVE",
      invitationToken: "private-invitation-token", invitationActive: true,
      memberships: ["owner", "aisha", "marcus", "jo", "lee"].map((userId) => ({ userId })),
    }]);
    mocks.memberProfiles.mockResolvedValue(new Map([
      ["owner", { name: "Tian Pok Neoh", handle: "tianpok" }],
      ["aisha", { name: "Aisha Tan", handle: "aisha_tan" }],
      ["marcus", { name: "Marcus Lim", handle: "marcus_lim" }],
      ["jo", { name: "Jo Lee", handle: "jo_lee" }],
    ]));
  });

  test("renders the new overview with real organiser and membership information", async () => {
    const page = await GroupsPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Your groups");
    expect(html).toContain("Organised by Tian Pok Neoh");
    expect(html).toContain("5 members");
    expect(html).toContain("AT");
    expect(html).toContain("+1");
    expect(mocks.listMine).toHaveBeenCalledExactlyOnceWith({ actorId: "owner" });
    expect(mocks.memberProfiles).toHaveBeenCalledExactlyOnceWith(["owner", "aisha", "marcus", "jo"]);
    expect(JSON.stringify(page)).not.toContain("private-invitation-token");
    expect(JSON.stringify(page)).not.toContain("invitationActive");
  });

  test("shows Find a player above the groups, without sending user IDs from the previews", async () => {
    const page = await GroupsPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Find a player");
    expect(html).toContain('role="search"');
    expect(html.indexOf("Find a player")).toBeLessThan(html.indexOf("Weekend Tennis Club"));
    expect(JSON.stringify(page)).not.toContain("aisha_tan");
  });

  test("keeps the leave confirmation visible on the overview", async () => {
    const page = await GroupsPage({ searchParams: Promise.resolve({ left: "1" }) });

    expect(renderToStaticMarkup(page)).toContain("You left the group.");
  });

  test("sends signed-out visitors to login before reading group data", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    await expect(GroupsPage({ searchParams: Promise.resolve({}) })).rejects.toEqual(new RedirectCalled("/login"));
    expect(mocks.listMine).not.toHaveBeenCalled();
    expect(mocks.memberProfiles).not.toHaveBeenCalled();
  });
});
