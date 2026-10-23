import { Participation, Session } from "@/domain";
import { describe, expect, test } from "vitest";
import {
  hoursBeforeSessionStart,
  withdrawnParticipation,
  createTestSession,
  sessionDetails,
} from "./session/session-fixtures";

describe("Participant roster isolation and queue ordering", () => {
  test("participations_WhenInputAndReturnedArraysAreMutated_PreservesEntriesAndLookups", () => {
    const originalSession = createTestSession({
      committedUserIds: ["alice", "ben"],
    });
    const alice =
      originalSession.participantList.requireParticipation("p-alice");
    const ben = originalSession.participantList.requireParticipation("p-ben");
    const participations = [alice, ben];
    const list = new Session(sessionDetails({ participations }))
      .participantList;

    participations.reverse();
    participations.pop();
    (list.participations as Participation[]).pop();
    (list.participations as Participation[]).reverse();

    expect(list.participations).toEqual([alice, ben]);
    expect(list.requireParticipation("p-alice")).toBe(alice);
    expect(list.findByUserId("alice")).toBe(alice);
    expect(list.requireParticipation("p-ben")).toBe(ben);
    expect(list.findByUserId("ben")).toBe(ben);
    expect(list.committedCount).toBe(2);
    expect(list.nextQueueSequence).toBe(1);
  });

  test("nextWaitlisted_WhenHydrationOrderDiffersFromQueue_SelectsLowestSequence", () => {
    const waitlistedAt = hoursBeforeSessionStart(48);
    const alice = Participation.createWaitlisted({
      participationId: "p-alice",
      userId: "alice",
      waitlistedAt,
      queueSequence: 3,
    });
    const ben = Participation.createWaitlisted({
      participationId: "p-ben",
      userId: "ben",
      waitlistedAt,
      queueSequence: 1,
    });
    const cara = Participation.createWaitlisted({
      participationId: "p-cara",
      userId: "cara",
      waitlistedAt,
      queueSequence: 2,
    });
    const list = new Session(
      sessionDetails({
        participations: [alice, ben, cara],
        nextQueueSequence: 4,
      }),
    ).participantList;

    const nextWaiter = list.nextWaitlisted();

    expect(nextWaiter).toBe(ben);
    expect(list.participations).toEqual([alice, ben, cara]);
    expect(list.findByUserId("ben")).toBe(nextWaiter);
    expect(list.committedCount).toBe(0);
    expect(list.nextQueueSequence).toBe(4);
  });

  test("oldestAwaitingReplacement_WhenWithdrawalTimesTie_PreservesHydrationOrder", () => {
    const caraWithdrewAt = hoursBeforeSessionStart(48);
    const tiedWithdrawalAt = hoursBeforeSessionStart(10);
    const refundedCara = withdrawnParticipation("cara", {
      holdState: "REFUNDED",
      withdrawnAt: caraWithdrewAt,
      settledAt: caraWithdrewAt,
    });
    const withdrawnAlice = withdrawnParticipation("alice", {
      holdState: "AWAITING_REPLACEMENT",
      withdrawnAt: tiedWithdrawalAt,
      replacementMode: "OPEN_SLOT",
    });
    const withdrawnBen = withdrawnParticipation("ben", {
      holdState: "AWAITING_REPLACEMENT",
      withdrawnAt: tiedWithdrawalAt,
      replacementMode: "OPEN_SLOT",
    });
    const list = new Session(
      sessionDetails({
        participations: [refundedCara, withdrawnBen, withdrawnAlice],
      }),
    ).participantList;

    const oldestReplacement = list.oldestAwaitingReplacement();

    expect(oldestReplacement).toBe(withdrawnBen);
    expect(list.participations).toEqual([
      refundedCara,
      withdrawnBen,
      withdrawnAlice,
    ]);
    expect(list.findByUserId("ben")).toBe(oldestReplacement);
    expect(list.committedCount).toBe(0);
    expect(list.nextWaitlisted()).toBeUndefined();
  });

  test("oldestAwaitingReplacement_WhenOlderWithdrawalReservesNamedSeat_SelectsOpenWithdrawal", () => {
    const aliceInvitedAt = hoursBeforeSessionStart(10);
    const benOpenedSeatAt = hoursBeforeSessionStart(9);
    const aliceInvitation = withdrawnParticipation("alice", {
      holdState: "AWAITING_REPLACEMENT",
      withdrawnAt: aliceInvitedAt,
      replacementMode: "DIRECT_INVITE",
      replacementInviteeId: "cara",
    });
    const benOpenWithdrawal = withdrawnParticipation("ben", {
      holdState: "AWAITING_REPLACEMENT",
      withdrawnAt: benOpenedSeatAt,
      replacementMode: "OPEN_SLOT",
    });
    const list = new Session(
      sessionDetails({ participations: [aliceInvitation, benOpenWithdrawal] }),
    ).participantList;

    const oldestReplacement = list.oldestAwaitingReplacement();

    expect(oldestReplacement).toBe(benOpenWithdrawal);
    expect(list.reservedCount).toBe(1);
    expect(list.personalReplacementForInvitee("cara")).toBe(aliceInvitation);
  });
});
