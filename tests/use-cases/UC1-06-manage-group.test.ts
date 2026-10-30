import { describe, expect, test } from "vitest";
import { DomainError } from "@/domain";
import { ManageGroup } from "@/use-cases/groups/manage-group";
import { inMemoryGroupDependencies } from "./support/in-memory-groups";

const OWNER = "owner-marcus";
const FRIEND = "friend-aisha";
const STRANGER = "stranger-ben";
/** Active accounts that can be found by user ID (ADR-0021). */
const PLAYERS = [
  { userId: FRIEND, handle: "aisha_tan", displayName: "Aisha Tan" },
  { userId: STRANGER, handle: "ben_lee", displayName: "Ben Lee" },
  { userId: OWNER, handle: "marcus_lim", displayName: "Marcus Lim" },
];

/** A ManageGroup over an empty in-memory store, plus one group owned by OWNER. */
async function withGroup(options: { readonly unsettledLinkedSessions?: number } = {}) {
  const { deps, rows } = inMemoryGroupDependencies({ ...options, players: PLAYERS });
  const manageGroup = new ManageGroup(deps);
  const group = await manageGroup.create({ ownerId: OWNER, name: "Weekend Tennis Crew" });
  return { manageGroup, rows, group };
}

/** Runs an action that should fail and returns the DomainError code it failed with. */
async function errorCode(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error("Expected a DomainError, but the action succeeded");
}

// Owner: Joseph (Jolingoes) — /app/groups
describe("UC1-06 Manage Group", () => {
  describe("creating a group", () => {
    test("creates a group", async () => {
      // Arrange + Act
      const { manageGroup, group } = await withGroup();

      // Assert
      const saved = await manageGroup.viewAsMember({ actorId: OWNER, groupId: group.groupId });
      expect(saved.name).toBe("Weekend Tennis Crew");
      expect(saved.ownerId).toBe(OWNER);
      expect(saved.memberships.map((member) => member.userId)).toEqual([OWNER]);
      expect(saved.invitationActive).toBe(true);
    });

    test("rejects a blank name", async () => {
      // Arrange
      const { deps } = inMemoryGroupDependencies();
      const manageGroup = new ManageGroup(deps);

      // Act
      const code = await errorCode(() => manageGroup.create({ ownerId: OWNER, name: "   " }));

      // Assert
      expect(code).toBe("INVALID_INPUT");
    });

    test("lists only the groups the user belongs to", async () => {
      // Arrange
      const { manageGroup } = await withGroup();
      await manageGroup.create({ ownerId: STRANGER, name: "Someone else's group" });

      // Act
      const mine = await manageGroup.listMine({ actorId: OWNER });

      // Assert
      expect(mine.map((group) => group.name)).toEqual(["Weekend Tennis Crew"]);
    });
  });

  describe("invitation links", () => {
    test("generates a working invitation link", async () => {
      // Arrange
      const { manageGroup, group } = await withGroup();

      // Act
      const { result } = await manageGroup.join({ userId: FRIEND, invitationToken: group.invitationToken });

      // Assert
      expect(result).toBe("JOINED");
      const saved = await manageGroup.viewAsMember({ actorId: FRIEND, groupId: group.groupId });
      expect(saved.memberships.map((member) => member.userId)).toEqual([OWNER, FRIEND]);
    });

    test("joining twice is harmless", async () => {
      // Arrange
      const { manageGroup, group } = await withGroup();
      await manageGroup.join({ userId: FRIEND, invitationToken: group.invitationToken });

      // Act
      const { result } = await manageGroup.join({ userId: FRIEND, invitationToken: group.invitationToken });

      // Assert
      expect(result).toBe("ALREADY_MEMBER");
    });

    test("rejects an unknown link", async () => {
      // Arrange
      const { manageGroup } = await withGroup();

      // Act
      const code = await errorCode(() => manageGroup.join({ userId: FRIEND, invitationToken: "made-up" }));

      // Assert
      expect(code).toBe("INVALID_INVITATION");
    });

    test("a revoked link stops working", async () => {
      // Arrange
      const { manageGroup, group } = await withGroup();
      await manageGroup.revokeInvitation({ actorId: OWNER, groupId: group.groupId });

      // Act
      const code = await errorCode(() =>
        manageGroup.join({ userId: FRIEND, invitationToken: group.invitationToken }),
      );

      // Assert
      expect(code).toBe("INVALID_INVITATION");
      expect(await errorCode(() => manageGroup.previewInvitation(group.invitationToken))).toBe("INVALID_INVITATION");
    });

    test("a new link replaces the old one", async () => {
      // Arrange
      const { manageGroup, group } = await withGroup();

      // Act
      const newToken = await manageGroup.rotateInvitation({ actorId: OWNER, groupId: group.groupId });

      // Assert
      expect(newToken).not.toBe(group.invitationToken);
      expect(await errorCode(() => manageGroup.join({ userId: FRIEND, invitationToken: group.invitationToken }))).toBe(
        "INVALID_INVITATION",
      );
      const { result } = await manageGroup.join({ userId: FRIEND, invitationToken: newToken });
      expect(result).toBe("JOINED");
    });
  });

  describe("membership management", () => {
    test("adds and removes members via the invitation link / membership management", async () => {
      // Arrange
      const { manageGroup, group } = await withGroup();
      await manageGroup.join({ userId: FRIEND, invitationToken: group.invitationToken });

      // Act
      await manageGroup.removeMember({ actorId: OWNER, groupId: group.groupId, userId: FRIEND });

      // Assert
      const saved = await manageGroup.viewAsMember({ actorId: OWNER, groupId: group.groupId });
      expect(saved.memberships.map((member) => member.userId)).toEqual([OWNER]);
    });

    test("the owner cannot be removed", async () => {
      // Arrange
      const { manageGroup, group } = await withGroup();

      // Act
      const code = await errorCode(() =>
        manageGroup.removeMember({ actorId: OWNER, groupId: group.groupId, userId: OWNER }),
      );

      // Assert
      expect(code).toBe("OWNER_REMOVAL");
    });

    test.each([
      ["remove a member", (m: ManageGroup, groupId: string) => m.removeMember({ actorId: FRIEND, groupId, userId: OWNER })],
      ["rename the group", (m: ManageGroup, groupId: string) => m.rename({ actorId: FRIEND, groupId, name: "Mine now" })],
      ["issue a new link", (m: ManageGroup, groupId: string) => m.rotateInvitation({ actorId: FRIEND, groupId })],
      ["turn the link off", (m: ManageGroup, groupId: string) => m.revokeInvitation({ actorId: FRIEND, groupId })],
      ["archive the group", (m: ManageGroup, groupId: string) => m.archive({ actorId: FRIEND, groupId })],
    ])("a member who is not the owner cannot %s", async (_action, act) => {
      // Arrange
      const { manageGroup, group } = await withGroup();
      await manageGroup.join({ userId: FRIEND, invitationToken: group.invitationToken });

      // Act
      const code = await errorCode(() => act(manageGroup, group.groupId));

      // Assert
      expect(code).toBe("UNAUTHORIZED");
    });

    test("a member can leave the group", async () => {
      // Arrange
      const { manageGroup, group } = await withGroup();
      await manageGroup.join({ userId: FRIEND, invitationToken: group.invitationToken });

      // Act
      await manageGroup.leave({ actorId: FRIEND, groupId: group.groupId });

      // Assert
      const saved = await manageGroup.viewAsMember({ actorId: OWNER, groupId: group.groupId });
      expect(saved.memberships.map((member) => member.userId)).toEqual([OWNER]);
      const mine = await manageGroup.listMine({ actorId: FRIEND });
      expect(mine).toEqual([]);
    });

    test("the owner cannot leave", async () => {
      // Arrange
      const { manageGroup, group } = await withGroup();

      // Act
      const code = await errorCode(() => manageGroup.leave({ actorId: OWNER, groupId: group.groupId }));

      // Assert
      expect(code).toBe("OWNER_REMOVAL");
    });

    test("someone who is not a member cannot leave", async () => {
      // Arrange
      const { manageGroup, group } = await withGroup();

      // Act
      const code = await errorCode(() => manageGroup.leave({ actorId: STRANGER, groupId: group.groupId }));

      // Assert
      expect(code).toBe("NOT_FOUND");
    });

    test("a member cannot leave an archived group", async () => {
      // Arrange
      const { manageGroup, group } = await withGroup();
      await manageGroup.join({ userId: FRIEND, invitationToken: group.invitationToken });
      await manageGroup.archive({ actorId: OWNER, groupId: group.groupId });

      // Act
      const code = await errorCode(() => manageGroup.leave({ actorId: FRIEND, groupId: group.groupId }));

      // Assert
      expect(code).toBe("INVALID_STATE");
    });

    test("non-members cannot see a group", async () => {
      // Arrange
      const { manageGroup, group } = await withGroup();

      // Act
      const code = await errorCode(() => manageGroup.viewAsMember({ actorId: STRANGER, groupId: group.groupId }));

      // Assert
      expect(code).toBe("NOT_FOUND");
    });
  });

  describe("inviting by user ID (ADR-0022)", () => {
    test("a member invites a player by user ID; the player sees it and joins by accepting", async () => {
      // Arrange
      const { manageGroup, group } = await withGroup();

      // Act
      const sent = await manageGroup.inviteByHandle({ actorId: OWNER, groupId: group.groupId, handle: "@Aisha_Tan" });
      const pending = await manageGroup.listInvitations({ actorId: FRIEND });
      const accepted = await manageGroup.acceptInvitation({ actorId: FRIEND, groupId: group.groupId });

      // Assert
      expect(sent).toEqual({ invitee: PLAYERS[0], result: "INVITED" });
      expect(pending).toEqual([
        {
          groupId: group.groupId,
          groupName: "Weekend Tennis Crew",
          invitedBy: OWNER,
          invitedAt: new Date("2026-10-01T08:00:00Z"),
        },
      ]);
      expect(accepted).toBe("JOINED");
      const saved = await manageGroup.viewAsMember({ actorId: FRIEND, groupId: group.groupId });
      expect(saved.memberships.map((member) => member.userId)).toEqual([OWNER, FRIEND]);
      expect(await manageGroup.listInvitations({ actorId: FRIEND })).toEqual([]);
    });

    test("an invitation doesn't make the player a member until they accept", async () => {
      // Arrange
      const { manageGroup, group } = await withGroup();

      // Act
      await manageGroup.inviteByHandle({ actorId: OWNER, groupId: group.groupId, handle: "aisha_tan" });

      // Assert
      expect(await errorCode(() => manageGroup.viewAsMember({ actorId: FRIEND, groupId: group.groupId }))).toBe("NOT_FOUND");
      expect(await manageGroup.listMine({ actorId: FRIEND })).toEqual([]);
    });

    test("inviting the same player twice keeps one invitation", async () => {
      // Arrange
      const { manageGroup, group, rows } = await withGroup();
      await manageGroup.inviteByHandle({ actorId: OWNER, groupId: group.groupId, handle: "aisha_tan" });

      // Act
      const repeated = await manageGroup.inviteByHandle({ actorId: OWNER, groupId: group.groupId, handle: "aisha_tan" });

      // Assert
      expect(repeated.result).toBe("ALREADY_INVITED");
      expect(rows.get(group.groupId)?.invitations.map((invitation) => invitation.inviteeId)).toEqual([FRIEND]);
    });

    test.each([
      ["nobody holds the user ID", OWNER, "nobody_here", "NOT_FOUND"],
      ["the user ID is malformed", OWNER, "9lives", "INVALID_INPUT"],
      ["the player invites themselves", OWNER, "marcus_lim", "INVALID_INPUT"],
      ["the inviter isn't a member", STRANGER, "aisha_tan", "UNAUTHORIZED"],
    ])("refuses when %s", async (_case, actorId, handle, expected) => {
      // Arrange
      const { manageGroup, group, rows } = await withGroup();

      // Act
      const code = await errorCode(() => manageGroup.inviteByHandle({ actorId, groupId: group.groupId, handle }));

      // Assert
      expect(code).toBe(expected);
      expect(rows.get(group.groupId)?.invitations).toEqual([]);
    });

    test("refuses to invite someone who is already a member", async () => {
      // Arrange
      const { manageGroup, group } = await withGroup();
      await manageGroup.join({ userId: FRIEND, invitationToken: group.invitationToken });

      // Act
      const code = await errorCode(() =>
        manageGroup.inviteByHandle({ actorId: OWNER, groupId: group.groupId, handle: "aisha_tan" }),
      );

      // Assert
      expect(code).toBe("ALREADY_MEMBER");
    });

    test("any member can invite while the link is on, and turning the link off ends pending invitations", async () => {
      // Arrange
      const { manageGroup, group } = await withGroup();
      await manageGroup.join({ userId: FRIEND, invitationToken: group.invitationToken });
      await manageGroup.inviteByHandle({ actorId: FRIEND, groupId: group.groupId, handle: "ben_lee" });

      // Act
      await manageGroup.revokeInvitation({ actorId: OWNER, groupId: group.groupId });

      // Assert
      expect(await manageGroup.listInvitations({ actorId: STRANGER })).toEqual([]);
      expect(await errorCode(() => manageGroup.acceptInvitation({ actorId: STRANGER, groupId: group.groupId }))).toBe(
        "INVALID_INVITATION",
      );
      expect(
        await errorCode(() => manageGroup.inviteByHandle({ actorId: FRIEND, groupId: group.groupId, handle: "ben_lee" })),
      ).toBe("INVALID_INVITATION");
    });

    test("declining removes the invitation without joining, and declining again is harmless", async () => {
      // Arrange
      const { manageGroup, group, rows } = await withGroup();
      await manageGroup.inviteByHandle({ actorId: OWNER, groupId: group.groupId, handle: "aisha_tan" });

      // Act
      await manageGroup.declineInvitation({ actorId: FRIEND, groupId: group.groupId });
      await manageGroup.declineInvitation({ actorId: FRIEND, groupId: group.groupId });

      // Assert
      expect(rows.get(group.groupId)?.invitations).toEqual([]);
      expect(rows.get(group.groupId)?.memberships.map((member) => member.userId)).toEqual([OWNER]);
      expect(await manageGroup.listInvitations({ actorId: FRIEND })).toEqual([]);
    });

    test("accepting a missing invitation is refused", async () => {
      // Arrange
      const { manageGroup, group } = await withGroup();

      // Act
      const code = await errorCode(() => manageGroup.acceptInvitation({ actorId: FRIEND, groupId: group.groupId }));
      const unknownGroup = await errorCode(() => manageGroup.acceptInvitation({ actorId: FRIEND, groupId: "missing" }));

      // Assert
      expect(code).toBe("INVALID_INVITATION");
      expect(unknownGroup).toBe("INVALID_INVITATION");
    });
  });

  describe("archiving", () => {
    test("archives a group with no unsettled sessions and turns its link off", async () => {
      // Arrange
      const { manageGroup, group } = await withGroup();

      // Act
      await manageGroup.archive({ actorId: OWNER, groupId: group.groupId });

      // Assert
      const saved = await manageGroup.viewAsMember({ actorId: OWNER, groupId: group.groupId });
      expect(saved.status).toBe("ARCHIVED");
      expect(saved.invitationActive).toBe(false);
    });

    test("waits until the group's sessions are settled", async () => {
      // Arrange
      const { manageGroup, group } = await withGroup({ unsettledLinkedSessions: 1 });

      // Act
      const code = await errorCode(() => manageGroup.archive({ actorId: OWNER, groupId: group.groupId }));

      // Assert
      expect(code).toBe("ACTIVE_OBLIGATIONS");
    });
  });
});
