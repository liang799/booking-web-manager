import { beforeEach, describe, expect, test, vi } from "vitest";
import { acceptGroupInvitation, declineGroupInvitation, invitePlayer } from "@/app/groups/actions";
import { DomainError } from "@/domain";
import { RedirectCalled } from "../../use-cases/support/fake-supabase-auth";

const GROUP_ID = "6f1c2a7e-4b8d-4c1e-9a3f-2d5b7c9e1f03";
const AISHA = { userId: "a1b2c3d4-0000-4000-8000-000000000001", handle: "aisha_tan", displayName: "Aisha Tan" };

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  inviteByHandle: vi.fn(),
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
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
  createManageGroup: () => ({
    inviteByHandle: mocks.inviteByHandle,
    acceptInvitation: mocks.acceptInvitation,
    declineInvitation: mocks.declineInvitation,
  }),
}));

function inviteForm(fields: { readonly handle?: string; readonly groupId?: string }) {
  const form = new FormData();
  form.set("handle", fields.handle ?? "@Aisha_Tan");
  form.set("groupId", fields.groupId ?? GROUP_ID);
  return invitePlayer({ status: "idle" }, form);
}

// Owner: Joseph (Jolingoes) — /app/groups (ADR-0022)
describe("UC1-06 invitations by user ID", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "marcus" } } });
    mocks.inviteByHandle.mockResolvedValue({ invitee: AISHA, result: "INVITED" });
    mocks.acceptInvitation.mockResolvedValue("JOINED");
    mocks.declineInvitation.mockResolvedValue(undefined);
  });

  describe("inviting", () => {
    test("invites the found player as the signed-in member, with their ID normalised", async () => {
      // Act
      const result = await inviteForm({});

      // Assert
      expect(result).toEqual({ status: "sent", message: "Invitation sent. Aisha Tan will see it on their Groups page." });
      expect(mocks.inviteByHandle).toHaveBeenCalledExactlyOnceWith({ actorId: "marcus", groupId: GROUP_ID, handle: "aisha_tan" });
      expect(JSON.stringify(result)).not.toContain(AISHA.userId);
    });

    test("says when the player already has an invitation", async () => {
      // Arrange
      mocks.inviteByHandle.mockResolvedValue({ invitee: AISHA, result: "ALREADY_INVITED" });

      // Act
      const result = await inviteForm({});

      // Assert
      expect(result).toEqual({ status: "sent", message: "Aisha Tan already has an invitation to this group." });
    });

    test.each([
      ["ALREADY_MEMBER", "They're already a member of this group."],
      ["INVALID_INVITATION", "This group's invitation link is turned off. Turn it on to invite players."],
      ["INVALID_INPUT", "You can't invite yourself."],
      ["UNAUTHORIZED", "Only members of this group can invite players."],
      ["INVALID_STATE", "This group is archived, so it can't invite players."],
      ["INACTIVE_ACCOUNT", "That player's account is no longer active."],
      ["NOT_FOUND", "That player or group wasn't found."],
    ] as const)("explains a %s refusal", async (code, message) => {
      // Arrange
      mocks.inviteByHandle.mockRejectedValue(new DomainError(code, "refused"));

      // Act
      const result = await inviteForm({});

      // Assert
      expect(result).toEqual({ status: "error", message });
    });

    test.each([
      ["a malformed user ID", { handle: "9lives" }, "Start with a letter"],
      ["a missing group", { groupId: "" }, "Choose a group to invite them to"],
    ])("checks %s before asking anyone", async (_case, fields, message) => {
      // Act
      const result = await inviteForm(fields);

      // Assert
      expect(result).toEqual({ status: "error", message });
      expect(mocks.inviteByHandle).not.toHaveBeenCalled();
    });

    test("asks a signed-out visitor to log in again", async () => {
      // Arrange
      mocks.getUser.mockResolvedValue({ data: { user: null } });

      // Act
      const result = await inviteForm({});

      // Assert
      expect(result).toEqual({ status: "error", message: "Please log in again." });
      expect(mocks.inviteByHandle).not.toHaveBeenCalled();
    });
  });

  describe("answering", () => {
    test("accepting joins as the signed-in player and opens the group", async () => {
      // Act
      const accepting = acceptGroupInvitation(GROUP_ID);

      // Assert
      await expect(accepting).rejects.toEqual(new RedirectCalled(`/groups/${GROUP_ID}`));
      expect(mocks.acceptInvitation).toHaveBeenCalledExactlyOnceWith({ actorId: "marcus", groupId: GROUP_ID });
      expect(mocks.revalidate).toHaveBeenCalledWith("/groups");
    });

    test("accepting an invitation that ended explains it", async () => {
      // Arrange
      mocks.acceptInvitation.mockRejectedValue(new DomainError("INVALID_INVITATION", "gone"));

      // Act
      const result = await acceptGroupInvitation(GROUP_ID);

      // Assert
      expect(result).toEqual({ error: "This invitation is no longer available. Ask a member for a new one." });
    });

    test("declining removes the invitation and refreshes the group list", async () => {
      // Act
      const result = await declineGroupInvitation(GROUP_ID);

      // Assert
      expect(result).toEqual({});
      expect(mocks.declineInvitation).toHaveBeenCalledExactlyOnceWith({ actorId: "marcus", groupId: GROUP_ID });
      expect(mocks.revalidate).toHaveBeenCalledWith("/groups");
    });

    test.each([
      ["accept", acceptGroupInvitation],
      ["decline", declineGroupInvitation],
    ])("refuses to %s an invitation for a malformed group ID", async (_case, answer) => {
      // Act
      const result = await answer("not-a-group");

      // Assert
      expect(result).toEqual({ error: "That invitation wasn't found." });
      expect(mocks.acceptInvitation).not.toHaveBeenCalled();
      expect(mocks.declineInvitation).not.toHaveBeenCalled();
    });
  });
});
