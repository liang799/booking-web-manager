import {
  DomainError,
  GroupMembership,
  RegularGroup,
  type RegularGroupDetails,
} from "@/domain";
import { describe, expect, test } from "vitest";

describe("RegularGroup", () => {
  describe("Construction and membership", () => {
    test("constructor_WhenMembershipsAreEmpty_ThrowsDomainError", () => {
      // Input
      const details = groupDetails({ memberships: [] });

      // Log & Oracle
      expect(() => new RegularGroup(details)).toThrow(DomainError);
    });

    test("constructor_WhenMembershipsAreDuplicated_ThrowsDomainError", () => {
      // Input
      const ownerMembership = new GroupMembership({ userId: "owner", joinedAt: now() });
      const details = groupDetails({ memberships: [ownerMembership, ownerMembership] });

      // Log & Oracle
      expect(() => new RegularGroup(details)).toThrow(DomainError);
    });

    test("constructor_WhenOwnerIsNotAMember_ThrowsDomainError", () => {
      // Input
      const details = groupDetails({ ownerId: "missing" });

      // Log & Oracle
      expect(() => new RegularGroup(details)).toThrow(DomainError);
    });

    test("constructor_WhenArchivedInvitationIsActive_ThrowsDomainError", () => {
      // Input
      const details = groupDetails({ status: "ARCHIVED", invitationActive: true });

      // Log & Oracle
      expect(() => new RegularGroup(details)).toThrow(DomainError);
    });

    test("constructor_WhenSourceMembershipsAreMutated_PreservesMembersAndDates", () => {
      // Input
      const memberships = [
        new GroupMembership({ userId: "owner", joinedAt: now() }),
      ];
      const details = groupDetails({ memberships });
      const group = new RegularGroup(details);

      // Attempt to alter the supplied membership collection and date.
      memberships[0]?.joinedAt.setUTCFullYear(2000);
      memberships.pop();

      // Log
      const storedMemberships = group.memberships;

      // Oracle
      expect(storedMemberships.map((member) => member.userId)).toEqual(["owner"]);
      expect(storedMemberships[0]?.joinedAt).toEqual(new Date("2026-09-15T00:00:00Z"));
    });

    test("memberships_WhenReturnedMembershipsAreMutated_PreservesMembersAndDates", () => {
      // Input
      const group = newGroup();
      const returnedMemberships = group.memberships as GroupMembership[];

      // Attempt to alter the returned membership collection and date.
      returnedMemberships[0]?.joinedAt.setUTCFullYear(2000);
      returnedMemberships.pop();

      // Log
      const storedMemberships = group.memberships;

      // Oracle
      expect(storedMemberships.map((member) => member.userId)).toEqual(["owner"]);
      expect(storedMemberships[0]?.joinedAt).toEqual(new Date("2026-09-15T00:00:00Z"));
    });
  });

  describe("Joining and invitations", () => {
    test("join_WhenMemberJoinsAgain_PreservesSingleMembership", () => {
      // Input
      const group = newGroup();

      // Log
      const firstJoin = group.join({
        userId: "player",
        invitationToken: "first-token",
        now: now(),
      });
      const repeatedJoin = group.join({
        userId: "player",
        invitationToken: "first-token",
        now: now(),
      });

      // Oracle
      expect(group.status).toBe("ACTIVE");
      expect(group.memberships.map((member) => member.userId)).toEqual([
        "owner",
        "player",
      ]);
      expect(firstJoin).toBe("JOINED");
      expect(repeatedJoin).toBe("ALREADY_MEMBER");
      expect(group.memberships).toHaveLength(2);
    });

    test("join_WhenInvitationIsRevokedForExistingMember_ThrowsInvalidInvitation", () => {
      // Input
      const group = newGroup();
      group.revokeInvitation("owner");
      const before = groupState(group);

      // Log & Oracle
      expect(() =>
        group.join({
          userId: "owner",
          invitationToken: "first-token",
          now: now(),
        }),
      ).toThrow(expect.objectContaining({ code: "INVALID_INVITATION" }));
      expect(groupState(group)).toEqual(before);
    });

    test("join_WhenTokenWasRotated_ThrowsInvalidInvitation", () => {
      // Input
      const group = newGroup();
      group.revokeInvitation("owner");
      group.rotateInvitation({
        actorId: "owner",
        invitationToken: "next-token",
      });
      const before = groupState(group);

      // Log & Oracle
      expect(() =>
        group.join({
          userId: "player",
          invitationToken: "first-token",
          now: now(),
        }),
      ).toThrow(expect.objectContaining({ code: "INVALID_INVITATION" }));
      expect(groupState(group)).toEqual(before);
    });

    test("join_WhenRevokedInvitationIsRotated_AcceptsNewToken", () => {
      // Input
      const group = newGroup();
      group.revokeInvitation("owner");
      group.rotateInvitation({
        actorId: "owner",
        invitationToken: "next-token",
      });

      // Log
      const admission = group.join({
        userId: "player",
        invitationToken: "next-token",
        now: now(),
      });

      // Oracle
      expect(admission).toBe("JOINED");
    });

    test("join_WhenGroupIsArchived_RejectsWithoutChangingState", () => {
      // Input
      const group = newGroup();
      group.archive({ actorId: "owner", unsettledLinkedSessions: 0 });
      const before = groupState(group);

      // Log & Oracle
      expect(() =>
        group.join({
          userId: "player",
          invitationToken: "first-token",
          now: now(),
        }),
      ).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));
      expect(groupState(group)).toEqual(before);
    });

    test("rotateInvitation_WhenActorIsNotOwner_RejectsWithoutChangingState", () => {
      // Input
      const group = newGroup();
      const before = groupState(group);

      // Log & Oracle
      expect(() =>
        group.rotateInvitation({ actorId: "other", invitationToken: "new" }),
      ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
      expect(groupState(group)).toEqual(before);
    });

    test("rotateInvitation_WhenGroupIsArchived_RejectsWithoutChangingState", () => {
      // Input
      const group = newGroup();
      group.archive({ actorId: "owner", unsettledLinkedSessions: 0 });
      const before = groupState(group);

      // Log & Oracle
      expect(() =>
        group.rotateInvitation({ actorId: "owner", invitationToken: "new" }),
      ).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));
      expect(groupState(group)).toEqual(before);
    });

    test("revokeInvitation_WhenActorIsNotOwner_RejectsWithoutChangingState", () => {
      // Input
      const group = newGroup();
      const before = groupState(group);

      // Log & Oracle
      expect(() => group.revokeInvitation("other")).toThrow(
        expect.objectContaining({ code: "UNAUTHORIZED" }),
      );
      expect(groupState(group)).toEqual(before);
    });
  });

  describe("Owner management", () => {
    test("rename_WhenActorIsNotOwner_RejectsWithoutChangingState", () => {
      // Input
      const group = newGroup();
      const before = groupState(group);

      // Log & Oracle
      expect(() =>
        group.rename({ actorId: "other", name: "New name" }),
      ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
      expect(groupState(group)).toEqual(before);
    });

    test("rename_WhenOwnerProvidesName_UpdatesName", () => {
      // Input
      const group = newGroup();

      group.rename({ actorId: "owner", name: "Saturday tennis" });

      // Log
      const updatedName = group.name;

      // Oracle
      expect(updatedName).toBe("Saturday tennis");
    });

    test("rename_WhenNameIsBlank_RejectsWithoutChangingState", () => {
      // Input
      const group = newGroup();
      const before = groupState(group);

      // Log & Oracle
      expect(() => group.rename({ actorId: "owner", name: " " })).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
      expect(groupState(group)).toEqual(before);
    });

    test("rename_WhenGroupIsArchived_RejectsWithoutChangingState", () => {
      // Input
      const group = newGroup();
      group.archive({ actorId: "owner", unsettledLinkedSessions: 0 });
      const before = groupState(group);

      // Log & Oracle
      expect(() => group.rename({ actorId: "owner", name: "New" })).toThrow(
        expect.objectContaining({ code: "INVALID_STATE" }),
      );
      expect(groupState(group)).toEqual(before);
    });

    test("removeMember_WhenActorIsNotOwner_RejectsWithoutChangingState", () => {
      // Input
      const group = newGroup();
      const before = groupState(group);

      // Log & Oracle
      expect(() =>
        group.removeMember({ actorId: "other", userId: "owner" }),
      ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
      expect(groupState(group)).toEqual(before);
    });

    test("removeMember_WhenOwnerRemovesAnotherMember_RetainsOwner", () => {
      // Input
      const group = newGroup();
      group.join({
        userId: "player",
        invitationToken: "first-token",
        now: now(),
      });

      group.removeMember({ actorId: "owner", userId: "player" });

      // Log
      const remainingMembers = group.memberships.map((member) => member.userId);

      // Oracle
      expect(remainingMembers).toEqual(["owner"]);
    });

    test("removeMember_WhenTargetIsOwner_RejectsWithoutChangingState", () => {
      // Input
      const group = newGroup();
      const before = groupState(group);

      // Log & Oracle
      expect(() =>
        group.removeMember({ actorId: "owner", userId: "owner" }),
      ).toThrow(expect.objectContaining({ code: "OWNER_REMOVAL" }));
      expect(groupState(group)).toEqual(before);
    });

    test("removeMember_WhenMemberIsMissing_RejectsWithoutChangingState", () => {
      // Input
      const group = newGroup();
      const before = groupState(group);

      // Log & Oracle
      expect(() =>
        group.removeMember({ actorId: "owner", userId: "missing" }),
      ).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
      expect(groupState(group)).toEqual(before);
    });

    test("archive_WhenActorIsNotOwner_RejectsWithoutChangingState", () => {
      // Input
      const group = newGroup();
      const before = groupState(group);

      // Log & Oracle
      expect(() =>
        group.archive({ actorId: "other", unsettledLinkedSessions: 0 }),
      ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
      expect(groupState(group)).toEqual(before);
    });

    test("archive_WhenLinkedSessionsAreUnsettled_RejectsWithoutChangingState", () => {
      // Input
      const group = newGroup();
      const before = groupState(group);

      // Log & Oracle
      expect(() =>
        group.archive({ actorId: "owner", unsettledLinkedSessions: 1 }),
      ).toThrow(expect.objectContaining({ code: "ACTIVE_OBLIGATIONS" }));
      expect(groupState(group)).toEqual(before);
    });

    test("archive_WhenLinkedSessionCountIsNegative_RejectsWithoutChangingState", () => {
      // Input
      const group = newGroup();
      const before = groupState(group);

      // Log & Oracle
      expect(() =>
        group.archive({ actorId: "owner", unsettledLinkedSessions: -1 }),
      ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
      expect(groupState(group)).toEqual(before);
    });

    test("archive_WhenAllLinkedSessionsAreSettled_RetainsMembersAndIsIdempotent", () => {
      // Input
      const group = newGroup();

      group.archive({ actorId: "owner", unsettledLinkedSessions: 0 });
      group.archive({ actorId: "owner", unsettledLinkedSessions: 0 });

      // Log
      const archivedState = {
        status: group.status,
        invitationActive: group.invitationActive,
        memberIds: group.memberships.map((member) => member.userId),
      };

      // Oracle
      expect(archivedState.status).toBe("ARCHIVED");
      expect(archivedState.invitationActive).toBe(false);
      expect(archivedState.memberIds).toEqual(["owner"]);
    });
  });

  describe("Leaving", () => {
    test("leave_WhenMemberLeaves_RemovesOnlyThatMember", () => {
      // Input
      const group = newGroup();
      group.join({ userId: "aisha", invitationToken: "first-token", now: now() });
      group.join({ userId: "ben", invitationToken: "first-token", now: now() });

      group.leave({ userId: "aisha" });

      // Log
      const remainingMembers = group.memberships.map((member) => member.userId);

      // Oracle
      expect(remainingMembers).toEqual([
        "owner",
        "ben",
      ]);
    });

    test("leave_WhenUserIsOwner_RejectsWithoutChangingState", () => {
      // Input
      const group = newGroup();
      group.join({ userId: "aisha", invitationToken: "first-token", now: now() });
      const before = groupState(group);

      // Log & Oracle
      expect(() => group.leave({ userId: "owner" })).toThrow(
        expect.objectContaining({ code: "OWNER_REMOVAL" }),
      );
      expect(groupState(group)).toEqual(before);
    });

    test("leave_WhenUserIsNotAMember_RejectsWithoutChangingState", () => {
      // Input
      const group = newGroup();
      const before = groupState(group);

      // Log & Oracle
      expect(() => group.leave({ userId: "stranger" })).toThrow(
        expect.objectContaining({ code: "NOT_FOUND" }),
      );
      expect(groupState(group)).toEqual(before);
    });

    test("leave_WhenGroupIsArchived_RejectsWithoutChangingState", () => {
      // Input
      const group = new RegularGroup(
        groupDetails({
          status: "ARCHIVED",
          invitationActive: false,
          memberships: [
            new GroupMembership({ userId: "owner", joinedAt: now() }),
            new GroupMembership({ userId: "aisha", joinedAt: now() }),
          ],
        }),
      );
      const before = groupState(group);

      // Log & Oracle
      expect(() => group.leave({ userId: "aisha" })).toThrow(
        expect.objectContaining({ code: "INVALID_STATE" }),
      );
      expect(groupState(group)).toEqual(before);
    });

    test("join_WhenFormerMemberUsesCurrentInvitation_JoinsAgain", () => {
      // Input
      const group = newGroup();
      group.join({ userId: "aisha", invitationToken: "first-token", now: now() });
      group.leave({ userId: "aisha" });

      // Log
      const readmission = group.join({
        userId: "aisha",
        invitationToken: "first-token",
        now: now(),
      });

      // Oracle
      expect(readmission).toBe("JOINED");
      expect(group.memberships.map((member) => member.userId)).toEqual([
        "owner",
        "aisha",
      ]);
    });
  });
});

const now = () => new Date("2026-09-15T00:00:00Z");
const newGroup = () =>
  RegularGroup.create({
    groupId: "group",
    ownerId: "owner",
    name: "Sunday badminton",
    invitationToken: "first-token",
    now: now(),
  });

function groupDetails(
  overrides: Partial<RegularGroupDetails> = {},
): RegularGroupDetails {
  return {
    groupId: "group",
    ownerId: "owner",
    name: "Badminton",
    invitationToken: "invite",
    invitationActive: true,
    status: "ACTIVE",
    memberships: [new GroupMembership({ userId: "owner", joinedAt: now() })],
    ...overrides,
  };
}

function groupState(group: RegularGroup) {
  return {
    name: group.name,
    invitationToken: group.invitationToken,
    invitationActive: group.invitationActive,
    memberships: group.memberships.map((member) => ({
      userId: member.userId,
      joinedAt: member.joinedAt,
    })),
    status: group.status,
  };
}
