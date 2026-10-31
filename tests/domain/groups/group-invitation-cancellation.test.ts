import { describe, expect, test } from "vitest";
import { DomainError, RegularGroup } from "@/domain";

function sampleGroup() {
  const group = RegularGroup.create({
    groupId: "group", ownerId: "owner", name: "Friday tennis",
    invitationToken: "token", now: new Date("2026-10-20T00:00:00Z"),
  });
  group.invite({ actorId: "owner", inviteeId: "player", now: new Date("2026-10-21T00:00:00Z") });
  return group;
}

describe("owner cancellation of pending group invitations", () => {
  test("removes exactly one unanswered invitation without disabling the link", () => {
    const group = sampleGroup();
    group.invite({ actorId: "owner", inviteeId: "other", now: new Date("2026-10-22T00:00:00Z") });
    expect(group.cancelInvitation({ actorId: "owner", inviteeId: "player" })).toBe(true);
    expect(group.invitations.map((invite) => invite.inviteeId)).toEqual(["other"]);
    expect(group.invitationActive).toBe(true);
  });
  test("retrying after cancellation is harmless", () => {
    const group = sampleGroup();
    expect(group.cancelInvitation({ actorId: "owner", inviteeId: "player" })).toBe(true);
    expect(group.cancelInvitation({ actorId: "owner", inviteeId: "player" })).toBe(false);
  });
  test("only the owner can cancel, even when the invited player is missing", () => {
    const group = sampleGroup();
    expect(() => group.cancelInvitation({ actorId: "another", inviteeId: "player" })).toThrow(DomainError);
    expect(group.invitations).toHaveLength(1);
  });
  test("archived groups cannot change invitations", () => {
    const group = sampleGroup();
    group.archive({ actorId: "owner", unsettledLinkedSessions: 0 });
    expect(() => group.cancelInvitation({ actorId: "owner", inviteeId: "player" })).toThrow(DomainError);
  });
});
