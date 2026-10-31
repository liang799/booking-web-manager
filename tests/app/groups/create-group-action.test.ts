import { beforeEach, describe, expect, test, vi } from "vitest";
import { DomainError } from "@/domain";
import { createGroupWithPlayers } from "@/app/groups/create-group-action";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), create: vi.fn(), inviteByHandle: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/use-case-config/groups", () => ({ createManageGroup: () => ({ create: mocks.create, inviteByHandle: mocks.inviteByHandle }) }));

function submit(name = "Friday tennis", handles: string[] = []) {
  const form = new FormData();
  form.set("name", name);
  handles.forEach((handle) => form.append("players", handle));
  return createGroupWithPlayers({ status: "idle" }, form);
}

describe("group creation with queued invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
    mocks.create.mockResolvedValue({ groupId: "created-group" });
    mocks.inviteByHandle.mockResolvedValue({ result: "INVITED" });
  });

  test("creates once and invites each normalized player once", async () => {
    expect(await submit("  Friday tennis  ", ["@Aisha_Tan", "aisha_tan", "marcus"])).toEqual({
      status: "created", groupId: "created-group", failedInvites: [],
    });
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith({ ownerId: "owner", name: "Friday tennis" });
    expect(mocks.inviteByHandle.mock.calls).toEqual([
      [{ actorId: "owner", groupId: "created-group", handle: "aisha_tan" }],
      [{ actorId: "owner", groupId: "created-group", handle: "marcus" }],
    ]);
    expect(mocks.revalidate).toHaveBeenCalledWith("/groups");
  });

  test.each([["", []], ["x".repeat(61), []], ["Valid", ["9invalid"]], ["Valid", Array.from({ length: 21 }, (_, i) => `player_${i}`)]])(
    "rejects invalid input before creating anything (%s)", async (name, handles) => {
      expect(await submit(String(name), handles as string[])).toMatchObject({ status: "error" });
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.inviteByHandle).not.toHaveBeenCalled();
    },
  );

  test("requires a signed-in owner", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await submit()).toEqual({ status: "error", message: "Please log in again." });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  test("keeps the created group when one invitation fails and tries the others", async () => {
    mocks.inviteByHandle.mockRejectedValueOnce(new DomainError("NOT_FOUND", "gone_player"));
    expect(await submit("Friday tennis", ["gone_player", "marcus"])).toEqual({
      status: "created", groupId: "created-group",
      failedInvites: [{ handle: "gone_player", message: "That player or group wasn't found." }],
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.inviteByHandle).toHaveBeenCalledTimes(2);
  });

  test("does not invite anyone after group creation fails", async () => {
    mocks.create.mockRejectedValue(new DomainError("INACTIVE_ACCOUNT", "inactive"));
    expect(await submit("Friday tennis", ["marcus"])).toMatchObject({ status: "error" });
    expect(mocks.inviteByHandle).not.toHaveBeenCalled();
  });
});
