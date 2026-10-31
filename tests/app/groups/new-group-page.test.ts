import { beforeEach, expect, test, vi } from "vitest";
import NewGroupPage from "@/app/groups/new/page";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/supabase/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/app/users/find-player-action", () => ({ findPlayer: vi.fn() }));
vi.mock("@/app/groups/create-group-action", () => ({ createGroupWithPlayers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

beforeEach(() => vi.clearAllMocks());

test("creation requires authentication", async () => {
  mocks.getCurrentUser.mockResolvedValue(null);
  await expect(NewGroupPage()).rejects.toThrow("redirect:/login");
});

test("creation drafts are scoped to the signed-in account", async () => {
  mocks.getCurrentUser.mockResolvedValueOnce({ id: "first-user" }).mockResolvedValueOnce({ id: "second-user" });
  const first = await NewGroupPage();
  const second = await NewGroupPage();
  expect(first.props.draftKey).toBe("group-draft:first-user");
  expect(second.props.draftKey).toBe("group-draft:second-user");
});
