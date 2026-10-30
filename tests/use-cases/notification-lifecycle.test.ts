import { describe, expect, test, vi } from "vitest";
import { Session } from "@/domain";
import { CommitToSession } from "@/use-cases/sessions/CommitToSession";
import { ManageGroup } from "@/use-cases/groups/manage-group";
import { createTestUserDetails } from "../domain/accounts/user-fixtures";
import { sessionDetails, hoursBeforeSessionStart } from "../domain/sessions/session/session-fixtures";
import { InMemoryUnitOfWork } from "./support/in-memory-unit-of-work";
import { inMemoryGroupDependencies } from "./support/in-memory-groups";

function commitment() {
  const unitOfWork = new InMemoryUnitOfWork({ users: [createTestUserDetails({ userId: "alice" })], sessions: [new Session(sessionDetails())] });
  let next = 0;
  const action = new CommitToSession({ unitOfWork, clock: { now: () => hoursBeforeSessionStart(48) }, ids: { next: () => `new-${++next}` } });
  return { action, unitOfWork, request: { userId: "alice", sessionId: "s", idempotencyKey: "join" } };
}

describe("transactional notification lifecycle", () => {
  test("commits a booking confirmation with the financial action and never duplicates it on replay", async () => {
    const { action, unitOfWork, request } = commitment();
    await action.forParticipant(request);
    await action.forParticipant(request);
    expect(unitOfWork.notifications).toEqual([expect.objectContaining({ kind: "BOOKING_JOINED", recipientId: "alice", sessionId: "s" })]);
  });

  test("rolls back commitment and held funds if its notification cannot be persisted", async () => {
    const { action, unitOfWork, request } = commitment();
    unitOfWork.failNextNotificationAppend = true;
    await expect(action.forParticipant(request)).rejects.toThrow("Notification append failed");
    expect(unitOfWork.requireSession("s").participantList.participations).toEqual([]);
    expect(unitOfWork.ledgerInstructions).toEqual([]);
    expect(unitOfWork.notifications).toEqual([]);
  });

  test("saves a group invitation atomically and consolidates acceptance for an owner who invited", async () => {
    const { deps } = inMemoryGroupDependencies({ players: [{ userId: "alice", handle: "alice_player", displayName: "Alice" }] });
    const save = vi.spyOn(deps.groups, "save");
    const groups = new ManageGroup(deps);
    const group = await groups.create({ ownerId: "owner", name: "Sunday players" });
    await groups.inviteByHandle({ actorId: "owner", groupId: group.groupId, handle: "alice_player" });
    expect(save.mock.calls.at(-1)?.[1]).toEqual([expect.objectContaining({ kind: "GROUP_INVITATION", recipientId: "alice", groupId: group.groupId })]);
    await groups.acceptInvitation({ actorId: "alice", groupId: group.groupId });
    expect(save.mock.calls.at(-1)?.[1]).toEqual([expect.objectContaining({ kind: "GROUP_INVITATION_ACCEPTED", recipientId: "owner" })]);
  });
});


describe("group notification audiences", () => {
  async function scenario() {
    const { deps, rows } = inMemoryGroupDependencies({ players: [
      { userId: "alice", handle: "alice_player", displayName: "Alice" },
      { userId: "bob", handle: "bob_player", displayName: "Bob" },
    ] });
    const save = vi.spyOn(deps.groups, "save");
    const manage = new ManageGroup(deps);
    const group = await manage.create({ ownerId: "owner", name: "Players" });
    const notices = () => save.mock.calls.flatMap((call) => call[1] ?? []);
    return { manage, group, save, notices, rows };
  }

  test("acceptance reaches the inviter and owner once each, while repeated invitation and acceptance create no activity", async () => {
    const { manage, group, save, notices } = await scenario();
    await manage.join({ userId: "bob", invitationToken: group.invitationToken });
    save.mockClear();
    await manage.inviteByHandle({ actorId: "bob", groupId: group.groupId, handle: "alice_player" });
    await manage.inviteByHandle({ actorId: "bob", groupId: group.groupId, handle: "alice_player" });
    await manage.acceptInvitation({ actorId: "alice", groupId: group.groupId });
    await manage.acceptInvitation({ actorId: "alice", groupId: group.groupId });
    expect(notices().map((entry) => [entry.kind, entry.recipientId])).toEqual([
      ["GROUP_INVITATION", "alice"], ["GROUP_INVITATION_ACCEPTED", "bob"], ["GROUP_MEMBER_JOINED", "owner"],
    ]);
  });

  test("declines notify the inviter without broadcasting activity to the owner", async () => {
    const { manage, group, save, notices } = await scenario();
    await manage.join({ userId: "bob", invitationToken: group.invitationToken });
    await manage.inviteByHandle({ actorId: "bob", groupId: group.groupId, handle: "alice_player" });
    save.mockClear();
    await manage.declineInvitation({ actorId: "alice", groupId: group.groupId });
    await manage.declineInvitation({ actorId: "alice", groupId: group.groupId });
    expect(notices().map((entry) => [entry.kind, entry.recipientId])).toEqual([["GROUP_INVITATION_DECLINED", "bob"]]);
  });

  test("archival notifies current members and ends pending invitations without notifying the owner", async () => {
    const { manage, group, save, notices } = await scenario();
    await manage.join({ userId: "bob", invitationToken: group.invitationToken });
    await manage.inviteByHandle({ actorId: "owner", groupId: group.groupId, handle: "alice_player" });
    save.mockClear();
    await manage.archive({ actorId: "owner", groupId: group.groupId });
    expect(notices().map((entry) => [entry.kind, entry.recipientId])).toEqual([["GROUP_ARCHIVED", "bob"], ["GROUP_INVITATION_ENDED", "alice"]]);
  });

  test("removal informs the removed member, voluntary departure informs only the owner", async () => {
    const { manage, group, save, notices } = await scenario();
    await manage.join({ userId: "bob", invitationToken: group.invitationToken });
    await manage.join({ userId: "alice", invitationToken: group.invitationToken });
    save.mockClear();
    await manage.removeMember({ actorId: "owner", groupId: group.groupId, userId: "bob" });
    await manage.leave({ actorId: "alice", groupId: group.groupId });
    expect(notices().map((entry) => [entry.kind, entry.recipientId])).toEqual([["GROUP_MEMBER_REMOVED", "bob"], ["GROUP_MEMBER_LEFT", "owner"]]);
  });

  test("renaming to the same name produces no redundant notice and revocation reaches each pending invitee", async () => {
    const { manage, group, save, notices } = await scenario();
    await manage.join({ userId: "bob", invitationToken: group.invitationToken });
    await manage.inviteByHandle({ actorId: "owner", groupId: group.groupId, handle: "alice_player" });
    save.mockClear();
    await manage.rename({ actorId: "owner", groupId: group.groupId, name: "Players" });
    await manage.revokeInvitation({ actorId: "owner", groupId: group.groupId });
    expect(notices().map((entry) => [entry.kind, entry.recipientId])).toEqual([["GROUP_INVITATION_ENDED", "alice"]]);
  });
});
