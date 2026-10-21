import { beforeEach, describe, expect, test, vi } from "vitest";
import { DomainError } from "@/domain";
import { leaveGroup } from "@/app/groups/actions";
import { RedirectCalled } from "../../use-cases/support/fake-supabase-auth";

const GROUP_ID = "6f1c2a7e-4b8d-4c1e-9a3f-2d5b7c9e1f03";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  leave: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", async () => {
  const { RedirectCalled: Redirect } = await import("../../use-cases/support/fake-supabase-auth");
  return {
    redirect: (path: string) => {
      throw new Redirect(path);
    },
  };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/use-case-config/groups", () => ({
  createManageGroup: () => ({ leave: mocks.leave }),
}));

// Owner: Joseph (Jolingoes) — /app/groups
describe("UC1-06 leave group action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "aisha" } } });
    mocks.leave.mockResolvedValue(undefined);
  });

  test("leaves as the signed-in member and opens the group list", async () => {
    // Act
    const leaving = leaveGroup(GROUP_ID);

    // Assert
    await expect(leaving).rejects.toEqual(new RedirectCalled("/groups?left=1"));
    expect(mocks.leave).toHaveBeenCalledExactlyOnceWith({ actorId: "aisha", groupId: GROUP_ID });
    expect(mocks.revalidate).toHaveBeenCalledWith("/groups");
    expect(mocks.revalidate).toHaveBeenCalledWith(`/groups/${GROUP_ID}`);
  });

  test("tells the owner to archive the group instead", async () => {
    // Arrange
    mocks.leave.mockRejectedValue(new DomainError("OWNER_REMOVAL", "The group owner cannot leave the group"));

    // Act
    const result = await leaveGroup(GROUP_ID);

    // Assert
    expect(result).toEqual({ error: "As the owner, you can't leave this group. Archive it instead." });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  test("explains when the user is no longer a member", async () => {
    // Arrange
    mocks.leave.mockRejectedValue(new DomainError("NOT_FOUND", "The group member was not found"));

    // Act
    const result = await leaveGroup(GROUP_ID);

    // Assert
    expect(result).toEqual({ error: "You're no longer a member of this group." });
  });

  test("rejects a malformed group id without leaving anything", async () => {
    // Act
    const result = await leaveGroup("not-a-group");

    // Assert
    expect(result).toEqual({ error: "That group wasn't found." });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.leave).not.toHaveBeenCalled();
  });

  test("asks a signed-out user to log in again", async () => {
    // Arrange
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    // Act
    const result = await leaveGroup(GROUP_ID);

    // Assert
    expect(result).toEqual({ error: "Please log in again." });
    expect(mocks.leave).not.toHaveBeenCalled();
  });
});
