import {
  GroupInvitation,
  GroupMembership,
  RegularGroup,
  type RegularGroupDetails,
} from "@/domain";
import { describe, expect, test } from "vitest";

describe("Regular group invitations by user ID", () => {
  describe("Restored invitations", () => {
    test("constructor_WhenInvitationsAreOmitted_HasNoInvitations", () => {
      const group = new RegularGroup(groupDetails());

      expect(group.invitations).toEqual([]);
    });

    test("constructor_WhenPlayerIsInvitedTwice_ThrowsDuplicateId", () => {
      const details = groupDetails({
        invitations: [invitation("aisha"), invitation("aisha")],
      });

      expect(() => new RegularGroup(details)).toThrow(
        expect.objectContaining({ code: "DUPLICATE_ID" }),
      );
    });

    test("constructor_WhenMemberIsAlsoInvited_ThrowsInvalidInput", () => {
      const details = groupDetails({
        memberships: groupMemberships("owner", "aisha"),
        invitations: [invitation("aisha")],
      });

      expect(() => new RegularGroup(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenInvitationLinkIsOffWithPendingInvitation_ThrowsInvalidInput", () => {
      const details = groupDetails({
        invitationActive: false,
        invitations: [invitation("aisha")],
      });

      expect(() => new RegularGroup(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenPlayerInvitesThemselves_ThrowsInvalidInput", () => {
      expect(
        () =>
          new GroupInvitation({
            inviteeId: "owner",
            invitedBy: "owner",
            invitedAt: now(),
          }),
      ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("invitations_WhenReturnedInvitationsAreMutated_PreservesInviteesAndDates", () => {
      const group = new RegularGroup(
        groupDetails({ invitations: [invitation("aisha")] }),
      );
      const returnedInvitations = group.invitations as GroupInvitation[];

      // Attempt to alter the returned invitation collection and date.
      returnedInvitations[0]?.invitedAt.setUTCFullYear(2000);
      returnedInvitations.pop();
      const storedInvitations = group.invitations;

      expect(storedInvitations.map((pending) => pending.inviteeId)).toEqual(["aisha"]);
      expect(storedInvitations[0]?.invitedAt).toEqual(new Date("2026-09-15T00:00:00Z"));
    });
  });

  describe("Sending invitations", () => {
    test("invite_WhenOwnerInvitesPlayer_AddsPendingInvitation", () => {
      const group = new RegularGroup(groupDetails());
      const invitedAt = new Date("2026-09-16T08:00:00Z");

      const result = group.invite({ actorId: "owner", inviteeId: "aisha", now: invitedAt });

      expect(result).toBe("INVITED");
      expect(invitationState(group)).toEqual([
        { inviteeId: "aisha", invitedBy: "owner", invitedAt },
      ]);
      expect(group.memberships.map((member) => member.userId)).toEqual(["owner"]);
    });

    test("invite_WhenMemberWhoIsNotOwnerInvitesPlayer_AddsPendingInvitation", () => {
      const group = new RegularGroup(
        groupDetails({ memberships: groupMemberships("owner", "ben") }),
      );

      const result = group.invite({ actorId: "ben", inviteeId: "aisha", now: now() });

      expect(result).toBe("INVITED");
      expect(invitationState(group)).toEqual([
        { inviteeId: "aisha", invitedBy: "ben", invitedAt: now() },
      ]);
    });

    test("invite_WhenPlayerIsAlreadyInvited_KeepsFirstInvitation", () => {
      const group = new RegularGroup(
        groupDetails({
          memberships: groupMemberships("owner", "ben"),
          invitations: [invitation("aisha")],
        }),
      );

      const result = group.invite({
        actorId: "ben",
        inviteeId: "aisha",
        now: new Date("2026-09-17T00:00:00Z"),
      });

      expect(result).toBe("ALREADY_INVITED");
      expect(invitationState(group)).toEqual([
        { inviteeId: "aisha", invitedBy: "owner", invitedAt: now() },
      ]);
    });

    test("invite_WhenActorIsNotMember_RejectsWithoutChangingState", () => {
      const group = new RegularGroup(groupDetails());
      const before = groupState(group);

      expect(() =>
        group.invite({ actorId: "stranger", inviteeId: "aisha", now: now() }),
      ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
      expect(groupState(group)).toEqual(before);
    });

    test("invite_WhenInvitationLinkIsOff_RejectsWithoutChangingState", () => {
      const group = new RegularGroup(groupDetails({ invitationActive: false }));
      const before = groupState(group);

      expect(() =>
        group.invite({ actorId: "owner", inviteeId: "aisha", now: now() }),
      ).toThrow(expect.objectContaining({ code: "INVALID_INVITATION" }));
      expect(groupState(group)).toEqual(before);
    });

    test("invite_WhenGroupIsArchived_RejectsWithoutChangingState", () => {
      const group = new RegularGroup(
        groupDetails({ status: "ARCHIVED", invitationActive: false }),
      );
      const before = groupState(group);

      expect(() =>
        group.invite({ actorId: "owner", inviteeId: "aisha", now: now() }),
      ).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));
      expect(groupState(group)).toEqual(before);
    });

    test("invite_WhenPlayerInvitesThemselves_RejectsWithoutChangingState", () => {
      const group = new RegularGroup(groupDetails());
      const before = groupState(group);

      expect(() =>
        group.invite({ actorId: "owner", inviteeId: "owner", now: now() }),
      ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
      expect(groupState(group)).toEqual(before);
    });

    test("invite_WhenPlayerIsAlreadyMember_RejectsWithoutChangingState", () => {
      const group = new RegularGroup(
        groupDetails({ memberships: groupMemberships("owner", "aisha") }),
      );
      const before = groupState(group);

      expect(() =>
        group.invite({ actorId: "owner", inviteeId: "aisha", now: now() }),
      ).toThrow(expect.objectContaining({ code: "ALREADY_MEMBER" }));
      expect(groupState(group)).toEqual(before);
    });
  });

  describe("Answering invitations", () => {
    test("acceptInvitation_WhenPlayerIsInvited_JoinsAndClearsInvitation", () => {
      const group = new RegularGroup(
        groupDetails({ invitations: [invitation("aisha")] }),
      );
      const acceptedAt = new Date("2026-09-16T09:30:00Z");

      const result = group.acceptInvitation({ userId: "aisha", now: acceptedAt });

      expect(result).toBe("JOINED");
      expect(group.memberships.map((member) => [member.userId, member.joinedAt])).toEqual([
        ["owner", now()],
        ["aisha", acceptedAt],
      ]);
      expect(group.invitations).toEqual([]);
    });

    test("acceptInvitation_WhenPlayerAlreadyAccepted_ReturnsAlreadyMember", () => {
      const group = new RegularGroup(
        groupDetails({ memberships: groupMemberships("owner", "aisha") }),
      );
      const before = groupState(group);

      const result = group.acceptInvitation({ userId: "aisha", now: now() });

      expect(result).toBe("ALREADY_MEMBER");
      expect(groupState(group)).toEqual(before);
    });

    test("acceptInvitation_WhenPlayerWasNotInvited_RejectsWithoutChangingState", () => {
      const group = new RegularGroup(
        groupDetails({ invitations: [invitation("aisha")] }),
      );
      const before = groupState(group);

      expect(() => group.acceptInvitation({ userId: "ben", now: now() })).toThrow(
        expect.objectContaining({ code: "INVALID_INVITATION" }),
      );
      expect(groupState(group)).toEqual(before);
    });

    test("acceptInvitation_WhenGroupIsArchived_RejectsWithoutChangingState", () => {
      const group = new RegularGroup(
        groupDetails({ status: "ARCHIVED", invitationActive: false }),
      );
      const before = groupState(group);

      expect(() => group.acceptInvitation({ userId: "aisha", now: now() })).toThrow(
        expect.objectContaining({ code: "INVALID_STATE" }),
      );
      expect(groupState(group)).toEqual(before);
    });

    test("declineInvitation_WhenPlayerIsInvited_RemovesOnlyTheirInvitation", () => {
      const group = new RegularGroup(
        groupDetails({ invitations: [invitation("aisha"), invitation("ben")] }),
      );

      group.declineInvitation({ userId: "aisha" });

      expect(group.invitations.map((pending) => pending.inviteeId)).toEqual(["ben"]);
      expect(group.memberships.map((member) => member.userId)).toEqual(["owner"]);
    });

    test("declineInvitation_WhenPlayerHasNoInvitation_LeavesStateUnchanged", () => {
      const group = new RegularGroup(
        groupDetails({ invitations: [invitation("aisha")] }),
      );
      const before = groupState(group);

      group.declineInvitation({ userId: "ben" });

      expect(groupState(group)).toEqual(before);
    });
  });

  describe("Invitations ending with the link", () => {
    test("join_WhenInvitedPlayerUsesTheLink_JoinsAndClearsInvitation", () => {
      const group = new RegularGroup(
        groupDetails({ invitations: [invitation("aisha"), invitation("ben")] }),
      );

      const result = group.join({ userId: "aisha", invitationToken: "first-token", now: now() });

      expect(result).toBe("JOINED");
      expect(group.invitations.map((pending) => pending.inviteeId)).toEqual(["ben"]);
    });

    test("revokeInvitation_WhenInvitationsArePending_ClearsThem", () => {
      const group = new RegularGroup(
        groupDetails({ invitations: [invitation("aisha")] }),
      );

      group.revokeInvitation("owner");

      expect(group.invitationActive).toBe(false);
      expect(group.invitations).toEqual([]);
    });

    test("rotateInvitation_WhenInvitationsArePending_KeepsThem", () => {
      const group = new RegularGroup(
        groupDetails({ invitations: [invitation("aisha")] }),
      );

      group.rotateInvitation({ actorId: "owner", invitationToken: "next-token" });

      expect(group.invitations.map((pending) => pending.inviteeId)).toEqual(["aisha"]);
    });

    test("archive_WhenInvitationsArePending_ClearsThem", () => {
      const group = new RegularGroup(
        groupDetails({ invitations: [invitation("aisha")] }),
      );

      group.archive({ actorId: "owner", unsettledLinkedSessions: 0 });

      expect(group.status).toBe("ARCHIVED");
      expect(group.invitations).toEqual([]);
    });
  });
});

const now = () => new Date("2026-09-15T00:00:00Z");

function invitation(inviteeId: string, invitedBy = "owner"): GroupInvitation {
  return new GroupInvitation({ inviteeId, invitedBy, invitedAt: now() });
}

function groupMemberships(...userIds: string[]): GroupMembership[] {
  return userIds.map((userId) => new GroupMembership({ userId, joinedAt: now() }));
}

function groupDetails(
  overrides: Partial<RegularGroupDetails> = {},
): RegularGroupDetails {
  return {
    groupId: "group",
    ownerId: "owner",
    name: "Sunday badminton",
    invitationToken: "first-token",
    invitationActive: true,
    status: "ACTIVE",
    memberships: groupMemberships("owner"),
    ...overrides,
  };
}

function invitationState(group: RegularGroup) {
  return group.invitations.map((pending) => ({
    inviteeId: pending.inviteeId,
    invitedBy: pending.invitedBy,
    invitedAt: pending.invitedAt,
  }));
}

function groupState(group: RegularGroup) {
  return {
    name: group.name,
    invitationToken: group.invitationToken,
    invitationActive: group.invitationActive,
    status: group.status,
    memberships: group.memberships.map((member) => ({
      userId: member.userId,
      joinedAt: member.joinedAt,
    })),
    invitations: invitationState(group),
  };
}
