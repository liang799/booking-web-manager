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
      const details = groupDetails({ memberships: [] });

      expect(() => new RegularGroup(details)).toThrow(DomainError);
    });

    test("constructor_WhenMembershipsAreDuplicated_ThrowsDomainError", () => {
      const ownerMembership = new GroupMembership({ userId: "owner", joinedAt: now() });
      const details = groupDetails({ memberships: [ownerMembership, ownerMembership] });

      expect(() => new RegularGroup(details)).toThrow(DomainError);
    });

    test("constructor_WhenOwnerIsNotAMember_ThrowsDomainError", () => {
      const details = groupDetails({ ownerId: "missing" });

      expect(() => new RegularGroup(details)).toThrow(DomainError);
    });

    test("constructor_WhenArchivedInvitationIsActive_ThrowsDomainError", () => {
      const details = groupDetails({ status: "ARCHIVED", invitationActive: true });

      expect(() => new RegularGroup(details)).toThrow(DomainError);
    });

    test("constructor_WhenSourceMembershipsAreMutated_PreservesMembersAndDates", () => {
      const memberships = [
        new GroupMembership({ userId: "owner", joinedAt: now() }),
      ];
      const details = groupDetails({ memberships });
      const group = new RegularGroup(details);

      // Attempt to alter the supplied membership collection and date.
      memberships[0]?.joinedAt.setUTCFullYear(2000);
      memberships.pop();
      const storedMemberships = group.memberships;

      expect(storedMemberships.map((member) => member.userId)).toEqual(["owner"]);
      expect(storedMemberships[0]?.joinedAt).toEqual(new Date("2026-09-15T00:00:00Z"));
    });

    test("memberships_WhenReturnedMembershipsAreMutated_PreservesMembersAndDates", () => {
      const group = newGroup();
      const returnedMemberships = group.memberships as GroupMembership[];

      // Attempt to alter the returned membership collection and date.
      returnedMemberships[0]?.joinedAt.setUTCFullYear(2000);
      returnedMemberships.pop();
      const storedMemberships = group.memberships;

      expect(storedMemberships.map((member) => member.userId)).toEqual(["owner"]);
      expect(storedMemberships[0]?.joinedAt).toEqual(new Date("2026-09-15T00:00:00Z"));
    });
  });

  describe("Joining and invitations", () => {
    test("join_WhenMemberJoinsAgain_PreservesSingleMembership", () => {
      const group = newGroup();

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
      const memberships = group.memberships;

      expect(group.status).toBe("ACTIVE");
      expect(memberships.map((member) => member.userId)).toEqual([
        "owner",
        "player",
      ]);
      expect(firstJoin).toBe("JOINED");
      expect(repeatedJoin).toBe("ALREADY_MEMBER");
      expect(memberships).toHaveLength(2);
    });

    test("join_WhenInvitationIsRevokedForExistingMember_ThrowsInvalidInvitation", () => {
      const group = newGroup();
      group.revokeInvitation("owner");
      const before = groupState(group);

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
      const group = newGroup();
      group.revokeInvitation("owner");
      group.rotateInvitation({
        actorId: "owner",
        invitationToken: "next-token",
      });
      const before = groupState(group);

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
      const group = newGroup();
      group.revokeInvitation("owner");
      group.rotateInvitation({
        actorId: "owner",
        invitationToken: "next-token",
      });

      const admission = group.join({
        userId: "player",
        invitationToken: "next-token",
        now: now(),
      });

      expect(admission).toBe("JOINED");
    });

    test("join_WhenGroupIsArchived_RejectsWithoutChangingState", () => {
      const group = newGroup();
      group.archive({ actorId: "owner", unsettledLinkedSessions: 0 });
      const before = groupState(group);

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
      const group = newGroup();
      const before = groupState(group);

      expect(() =>
        group.rotateInvitation({ actorId: "other", invitationToken: "new" }),
      ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
      expect(groupState(group)).toEqual(before);
    });

    test("rotateInvitation_WhenGroupIsArchived_RejectsWithoutChangingState", () => {
      const group = newGroup();
      group.archive({ actorId: "owner", unsettledLinkedSessions: 0 });
      const before = groupState(group);

      expect(() =>
        group.rotateInvitation({ actorId: "owner", invitationToken: "new" }),
      ).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));
      expect(groupState(group)).toEqual(before);
    });

    test("revokeInvitation_WhenActorIsNotOwner_RejectsWithoutChangingState", () => {
      const group = newGroup();
      const before = groupState(group);

      expect(() => group.revokeInvitation("other")).toThrow(
        expect.objectContaining({ code: "UNAUTHORIZED" }),
      );
      expect(groupState(group)).toEqual(before);
    });
  });

  describe("Owner management", () => {
    test("rename_WhenActorIsNotOwner_RejectsWithoutChangingState", () => {
      const group = newGroup();
      const before = groupState(group);

      expect(() =>
        group.rename({ actorId: "other", name: "New name" }),
      ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
      expect(groupState(group)).toEqual(before);
    });

    test("rename_WhenOwnerProvidesName_UpdatesName", () => {
      const group = newGroup();

      group.rename({ actorId: "owner", name: "Saturday tennis" });

      expect(group.name).toBe("Saturday tennis");
    });

    test("rename_WhenNameIsBlank_RejectsWithoutChangingState", () => {
      const group = newGroup();
      const before = groupState(group);

      expect(() => group.rename({ actorId: "owner", name: " " })).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
      expect(groupState(group)).toEqual(before);
    });

    test("rename_WhenGroupIsArchived_RejectsWithoutChangingState", () => {
      const group = newGroup();
      group.archive({ actorId: "owner", unsettledLinkedSessions: 0 });
      const before = groupState(group);

      expect(() => group.rename({ actorId: "owner", name: "New" })).toThrow(
        expect.objectContaining({ code: "INVALID_STATE" }),
      );
      expect(groupState(group)).toEqual(before);
    });

    test("removeMember_WhenActorIsNotOwner_RejectsWithoutChangingState", () => {
      const group = newGroup();
      const before = groupState(group);

      expect(() =>
        group.removeMember({ actorId: "other", userId: "owner" }),
      ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
      expect(groupState(group)).toEqual(before);
    });

    test("removeMember_WhenOwnerRemovesAnotherMember_RetainsOwner", () => {
      const group = newGroup();
      group.join({
        userId: "player",
        invitationToken: "first-token",
        now: now(),
      });

      group.removeMember({ actorId: "owner", userId: "player" });

      expect(group.memberships.map((member) => member.userId)).toEqual(["owner"]);
    });

    test("removeMember_WhenTargetIsOwner_RejectsWithoutChangingState", () => {
      const group = newGroup();
      const before = groupState(group);

      expect(() =>
        group.removeMember({ actorId: "owner", userId: "owner" }),
      ).toThrow(expect.objectContaining({ code: "OWNER_REMOVAL" }));
      expect(groupState(group)).toEqual(before);
    });

    test("removeMember_WhenMemberIsMissing_RejectsWithoutChangingState", () => {
      const group = newGroup();
      const before = groupState(group);

      expect(() =>
        group.removeMember({ actorId: "owner", userId: "missing" }),
      ).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
      expect(groupState(group)).toEqual(before);
    });

    test("archive_WhenActorIsNotOwner_RejectsWithoutChangingState", () => {
      const group = newGroup();
      const before = groupState(group);

      expect(() =>
        group.archive({ actorId: "other", unsettledLinkedSessions: 0 }),
      ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
      expect(groupState(group)).toEqual(before);
    });

    test("archive_WhenLinkedSessionsAreUnsettled_RejectsWithoutChangingState", () => {
      const group = newGroup();
      const before = groupState(group);

      expect(() =>
        group.archive({ actorId: "owner", unsettledLinkedSessions: 1 }),
      ).toThrow(expect.objectContaining({ code: "ACTIVE_OBLIGATIONS" }));
      expect(groupState(group)).toEqual(before);
    });

    test("archive_WhenLinkedSessionCountIsNegative_RejectsWithoutChangingState", () => {
      const group = newGroup();
      const before = groupState(group);

      expect(() =>
        group.archive({ actorId: "owner", unsettledLinkedSessions: -1 }),
      ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
      expect(groupState(group)).toEqual(before);
    });

    test("archive_WhenAllLinkedSessionsAreSettled_RetainsMembersAndIsIdempotent", () => {
      const group = newGroup();

      group.archive({ actorId: "owner", unsettledLinkedSessions: 0 });
      group.archive({ actorId: "owner", unsettledLinkedSessions: 0 });

      expect(group.status).toBe("ARCHIVED");
      expect(group.invitationActive).toBe(false);
      expect(group.memberships.map((member) => member.userId)).toEqual(["owner"]);
    });
  });

  describe("Leaving", () => {
    test("leave_WhenMemberLeaves_RemovesOnlyThatMember", () => {
      const group = newGroup();
      group.join({ userId: "aisha", invitationToken: "first-token", now: now() });
      group.join({ userId: "ben", invitationToken: "first-token", now: now() });

      group.leave({ userId: "aisha" });

      expect(group.memberships.map((member) => member.userId)).toEqual([
        "owner",
        "ben",
      ]);
    });

    test("leave_WhenUserIsOwner_RejectsWithoutChangingState", () => {
      const group = newGroup();
      group.join({ userId: "aisha", invitationToken: "first-token", now: now() });
      const before = groupState(group);

      expect(() => group.leave({ userId: "owner" })).toThrow(
        expect.objectContaining({ code: "OWNER_REMOVAL" }),
      );
      expect(groupState(group)).toEqual(before);
    });

    test("leave_WhenUserIsNotAMember_RejectsWithoutChangingState", () => {
      const group = newGroup();
      const before = groupState(group);

      expect(() => group.leave({ userId: "stranger" })).toThrow(
        expect.objectContaining({ code: "NOT_FOUND" }),
      );
      expect(groupState(group)).toEqual(before);
    });

    test("leave_WhenGroupIsArchived_RejectsWithoutChangingState", () => {
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

      expect(() => group.leave({ userId: "aisha" })).toThrow(
        expect.objectContaining({ code: "INVALID_STATE" }),
      );
      expect(groupState(group)).toEqual(before);
    });

    test("join_WhenFormerMemberUsesCurrentInvitation_JoinsAgain", () => {
      const group = newGroup();
      group.join({ userId: "aisha", invitationToken: "first-token", now: now() });
      group.leave({ userId: "aisha" });

      const readmission = group.join({
        userId: "aisha",
        invitationToken: "first-token",
        now: now(),
      });

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
