import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GroupsPage from "@/app/groups/page";
import { RedirectCalled } from "../../use-cases/support/fake-supabase-auth";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listMine: vi.fn(),
  displayNames: vi.fn(),
}));
vi.mock("@/lib/supabase/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/supabase/profile-names", () => ({ displayNames: mocks.displayNames }));
vi.mock("@/use-case-config/groups", () => ({ createManageGroup: () => ({ listMine: mocks.listMine }) }));
vi.mock("@/app/groups/_components/group-controls", () => ({ CreateGroupForm: () => null }));
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
    mocks.displayNames.mockResolvedValue(new Map([
      ["owner", "Tian Pok Neoh"], ["aisha", "Aisha Tan"], ["marcus", "Marcus Lim"], ["jo", "Jo Lee"],
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
    expect(mocks.displayNames).toHaveBeenCalledExactlyOnceWith(["owner", "aisha", "marcus", "jo"]);
    expect(JSON.stringify(page)).not.toContain("private-invitation-token");
    expect(JSON.stringify(page)).not.toContain("invitationActive");
  });

  test("keeps the leave confirmation visible on the overview", async () => {
    const page = await GroupsPage({ searchParams: Promise.resolve({ left: "1" }) });

    expect(renderToStaticMarkup(page)).toContain("You left the group.");
  });

  test("sends signed-out visitors to login before reading group data", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    await expect(GroupsPage({ searchParams: Promise.resolve({}) })).rejects.toEqual(new RedirectCalled("/login"));
    expect(mocks.listMine).not.toHaveBeenCalled();
    expect(mocks.displayNames).not.toHaveBeenCalled();
  });
});
