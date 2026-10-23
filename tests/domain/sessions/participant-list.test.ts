import { Participation, Session } from "@/domain";
import { describe, expect, test } from "vitest";
import {
  hoursBeforeSessionStart,
  committedParticipation,
  createTestSession,
  sessionDetails,
} from "./session/session-fixtures";

describe("ParticipantList", () => {
  test("participations_WhenInputAndReturnedArraysAreMutated_PreservesEntriesAndLookups", () => {
    // Input
    const originalSession = createTestSession({
      committedUserIds: ["alice", "ben"],
    });
    const alice =
      originalSession.participantList.requireParticipation("p-alice");
    const ben = originalSession.participantList.requireParticipation("p-ben");
    const participations = [alice, ben];
    const list = new Session(sessionDetails({ participations }))
      .participantList;

    // Log
    participations.reverse();
    participations.pop();
    (list.participations as Participation[]).pop();
    (list.participations as Participation[]).reverse();

    // Oracle
    expect(list.participations).toEqual([alice, ben]);
    expect(list.requireParticipation("p-alice")).toBe(alice);
    expect(list.findByUserId("alice")).toBe(alice);
    expect(list.requireParticipation("p-ben")).toBe(ben);
    expect(list.findByUserId("ben")).toBe(ben);
    expect(list.committedCount).toBe(2);
    expect(list.nextQueueSequence).toBe(1);
  });

  test("nextWaitlisted_WhenHydrationOrderDiffersFromQueue_SelectsLowestSequence", () => {
    // Input
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

    // Log
    const nextWaiter = list.nextWaitlisted();

    // Oracle
    expect(nextWaiter).toBe(ben);
    expect(list.participations).toEqual([alice, ben, cara]);
    expect(list.findByUserId("ben")).toBe(nextWaiter);
    expect(list.committedCount).toBe(0);
    expect(list.nextQueueSequence).toBe(4);
  });

  test("oldestAwaitingReplacement_WhenWithdrawalTimesTie_PreservesHydrationOrder", () => {
    // Input
    const caraWithdrewAt = hoursBeforeSessionStart(48);
    const tiedWithdrawalAt = hoursBeforeSessionStart(10);
    const originalSession = createTestSession();
    const alice = committedParticipation(originalSession, "alice");
    const ben = committedParticipation(originalSession, "ben");
    const cara = committedParticipation(originalSession, "cara");
    const refundedCara = cara.withdraw(
      cara.hold!.refund(caraWithdrewAt),
      caraWithdrewAt,
    );
    const withdrawnAlice = alice.withdraw(
      alice.hold!.awaitReplacement(),
      tiedWithdrawalAt,
      "OPEN_SLOT",
    );
    const withdrawnBen = ben.withdraw(
      ben.hold!.awaitReplacement(),
      tiedWithdrawalAt,
      "OPEN_SLOT",
    );
    const list = new Session(
      sessionDetails({
        participations: [refundedCara, withdrawnBen, withdrawnAlice],
      }),
    ).participantList;

    // Log
    const oldestReplacement = list.oldestAwaitingReplacement();

    // Oracle
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
    // Input
    const aliceInvitedAt = hoursBeforeSessionStart(10);
    const benOpenedSeatAt = hoursBeforeSessionStart(9);
    const originalSession = createTestSession();
    const alice = committedParticipation(originalSession, "alice");
    const ben = committedParticipation(originalSession, "ben");
    const aliceInvitation = alice.withdraw(
      alice.hold!.awaitReplacement(),
      aliceInvitedAt,
      "DIRECT_INVITE",
      "cara",
    );
    const benOpenWithdrawal = ben.withdraw(
      ben.hold!.awaitReplacement(),
      benOpenedSeatAt,
      "OPEN_SLOT",
    );
    const list = new Session(
      sessionDetails({ participations: [aliceInvitation, benOpenWithdrawal] }),
    ).participantList;

    // Log
    const oldestReplacement = list.oldestAwaitingReplacement();

    // Oracle
    expect(oldestReplacement).toBe(benOpenWithdrawal);
    expect(list.reservedCount).toBe(1);
    expect(list.personalReplacementForInvitee("cara")).toBe(aliceInvitation);
  });
});
