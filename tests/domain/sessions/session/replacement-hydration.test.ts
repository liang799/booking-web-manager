import { FundHold, Money, Participation, Session } from "@/domain";
import { describe, expect, test } from "vitest";
import { hoursBeforeSessionStart, sessionDetails } from "./session-fixtures";

describe("Session", () => {
  test("constructor_WhenReplacementTargetIsMissing_RejectsUnownedReference", () => {
    // Input
    const replacement = replacementCommitment("ben", "p-missing");
    const details = sessionDetails({ participations: [replacement] });

    // Log & Oracle
    expect(() => new Session(details)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenDepartedWaiterClaimsInvitation_RejectsPhantomAcceptance", () => {
    // Input
    const inviter = refundedInvitation();
    const departedWaiter = new Participation({
      participationId: "p-ben",
      userId: "ben",
      status: "LEFT_WAITLIST",
      attendance: "UNVERIFIED",
      waitlistedAt: hoursBeforeSessionStart(48),
      queueSequence: 1,
      replacesParticipationId: "p-alice",
    });
    const details = sessionDetails({
      participations: [inviter, departedWaiter],
      nextQueueSequence: 2,
    });

    // Log & Oracle
    expect(() => new Session(details)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenReplacementIsNotNamedInvitee_RejectsWrongRecipient", () => {
    // Input
    const inviter = refundedInvitation();
    const wrongRecipient = replacementCommitment("cara", "p-alice");
    const details = sessionDetails({
      participations: [inviter, wrongRecipient],
    });

    // Log & Oracle
    expect(() => new Session(details)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenReplacedWithdrawalIsNotRefunded_RejectsUnsettledAcceptance", () => {
    // Input
    const aliceCommittedAt = hoursBeforeSessionStart(48);
    const aliceInvitedAt = hoursBeforeSessionStart(10);
    const inviter = new Participation({
      participationId: "p-alice",
      userId: "alice",
      status: "WITHDRAWN",
      attendance: "UNVERIFIED",
      committedAt: aliceCommittedAt,
      withdrawnAt: aliceInvitedAt,
      replacementMode: "DIRECT_INVITE",
      replacementInviteeId: "ben",
      hold: heldShare("alice").awaitReplacement(),
    });
    const replacement = replacementCommitment("ben", "p-alice");
    const details = sessionDetails({ participations: [inviter, replacement] });

    // Log & Oracle
    expect(() => new Session(details)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenTargetWasCancelledWithoutWithdrawal_RejectsUnrelatedRefund", () => {
    // Input
    const aliceCommittedAt = hoursBeforeSessionStart(48);
    const cancelledAt = hoursBeforeSessionStart(40);
    const cancelledParticipant = new Participation({
      participationId: "p-alice",
      userId: "alice",
      status: "CANCELLED",
      attendance: "UNVERIFIED",
      committedAt: aliceCommittedAt,
      hold: heldShare("alice").refund(cancelledAt),
    });
    const replacement = replacementCommitment("ben", "p-alice");
    const details = sessionDetails({
      participations: [cancelledParticipant, replacement],
    });

    // Log & Oracle
    expect(() => new Session(details)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenRemovedReplacementHasNoCommitmentHistory_RejectsPhantomAcceptance", () => {
    // Input
    const inviter = refundedInvitation();
    const uncommittedReplacement = new Participation({
      participationId: "p-ben",
      userId: "ben",
      status: "REMOVED",
      attendance: "UNVERIFIED",
      replacesParticipationId: "p-alice",
    });
    const details = sessionDetails({
      participations: [inviter, uncommittedReplacement],
    });

    // Log & Oracle
    expect(() => new Session(details)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenNamedReplacementCommitted_RestoresConsumedInvitation", () => {
    // Input
    const inviter = refundedInvitation();
    const replacement = replacementCommitment("ben", "p-alice");
    const details = sessionDetails({ participations: [inviter, replacement] });

    // Log
    const restored = new Session(details);

    const benInvitation =
      restored.participantList.personalReplacementForInvitee("ben");
    const availableSlots =
      restored.getAvailableSlots(hoursBeforeSessionStart(38));

    // Oracle
    expect(restored.participantList.reservedCount).toBe(0);
    expect(benInvitation).toBeUndefined();
    expect(restored.participantList.committedCount).toBe(1);
    expect(availableSlots).toBe(1);
  });

  test("constructor_WhenAcceptedReplacementLaterWithdraws_KeepsOriginalInvitationConsumed", () => {
    // Input
    const benWithdrewAt = hoursBeforeSessionStart(10);
    const availabilityCheckedAt = hoursBeforeSessionStart(9);
    const inviter = refundedInvitation();
    const replacement = replacementCommitment("ben", "p-alice");
    const withdrawnReplacement = replacement.withdraw(
      replacement.hold!.awaitReplacement(),
      benWithdrewAt,
      "OPEN_SLOT",
    );
    const details = sessionDetails({
      participations: [inviter, withdrawnReplacement],
    });

    // Log
    const restored = new Session(details);

    const benInvitation =
      restored.participantList.personalReplacementForInvitee("ben");
    const replacedParticipationId = restored.participantList
      .requireParticipation("p-ben").replacesParticipationId;
    const availableSlots = restored.getAvailableSlots(availabilityCheckedAt);

    // Oracle
    expect(restored.participantList.reservedCount).toBe(0);
    expect(benInvitation).toBeUndefined();
    expect(replacedParticipationId).toBe("p-alice");
    expect(availableSlots).toBe(2);
  });

  test("constructor_WhenAcceptedReplacementIsRemoved_KeepsOriginalInvitationConsumed", () => {
    // Input
    const benRemovedAt = hoursBeforeSessionStart(38);
    const availabilityCheckedAt = hoursBeforeSessionStart(37);
    const inviter = refundedInvitation();
    const replacement = replacementCommitment("ben", "p-alice");
    const removedReplacement = replacement.remove(
      replacement.hold!.refund(benRemovedAt),
    );
    const details = sessionDetails({
      participations: [inviter, removedReplacement],
    });

    // Log
    const restored = new Session(details);

    const benInvitation =
      restored.participantList.personalReplacementForInvitee("ben");
    const replacedParticipationId = restored.participantList
      .requireParticipation("p-ben").replacesParticipationId;
    const availableSlots = restored.getAvailableSlots(availabilityCheckedAt);

    // Oracle
    expect(restored.participantList.reservedCount).toBe(0);
    expect(benInvitation).toBeUndefined();
    expect(replacedParticipationId).toBe("p-alice");
    expect(availableSlots).toBe(2);
  });

  test("constructor_WhenSessionWithAcceptedReplacementIsCancelled_RetainsReplacementHistory", () => {
    // Input
    const inviter = refundedInvitation();
    const replacement = replacementCommitment("ben", "p-alice");
    const details = sessionDetails({
      status: "CANCELLED",
      participations: [
        inviter.cancel(),
        replacement.cancel(
          replacement.hold!.refund(hoursBeforeSessionStart(38)),
        ),
      ],
    });

    // Log
    const restored = new Session(details);

    const benInvitation =
      restored.participantList.personalReplacementForInvitee("ben");
    const replacedParticipationId = restored.participantList
      .requireParticipation("p-ben").replacesParticipationId;
    const aliceHoldState =
      restored.participantList.requireParticipation("p-alice").hold?.state;

    // Oracle
    expect(restored.status).toBe("CANCELLED");
    expect(restored.participantList.reservedCount).toBe(0);
    expect(benInvitation).toBeUndefined();
    expect(replacedParticipationId).toBe("p-alice");
    expect(aliceHoldState).toBe("REFUNDED");
  });
});

function heldShare(
  userId: string,
  createdAt = hoursBeforeSessionStart(48),
): FundHold {
  return FundHold.create({
    holdId: `h-${userId}`,
    participationId: `p-${userId}`,
    walletId: `w-${userId}`,
    holdingAccountId: "platform",
    amount: Money.fromCents(500),
    createdAt,
  });
}

function refundedInvitation(): Participation {
  const aliceInvitedAt = hoursBeforeSessionStart(40);
  return new Participation({
    participationId: "p-alice",
    userId: "alice",
    status: "WITHDRAWN",
    attendance: "UNVERIFIED",
    committedAt: hoursBeforeSessionStart(48),
    withdrawnAt: aliceInvitedAt,
    replacementMode: "DIRECT_INVITE",
    replacementInviteeId: "ben",
    hold: heldShare("alice").refund(aliceInvitedAt),
  });
}

function replacementCommitment(
  userId: string,
  replacesParticipationId: string,
): Participation {
  const replacementCommittedAt = hoursBeforeSessionStart(39);
  return Participation.createCommitted({
    participationId: `p-${userId}`,
    userId,
    committedAt: replacementCommittedAt,
    hold: heldShare(userId, replacementCommittedAt),
    replacesParticipationId,
  });
}
