import {
  FundHold,
  type FundHoldDetails,
  Money,
  Participation,
  type ParticipationDetails,
  Session,
} from "@/domain";
import { describe, expect, test } from "vitest";
import { hoursBeforeSessionStart, sessionDetails } from "./session-fixtures";

describe("Session replacement history restoration", () => {
  describe("Replacement ownership and refund proof", () => {
    test("constructor_WhenReplacementTargetIsMissing_RejectsUnownedReference", () => {
      const replacement = replacementParticipation("ben", "p-missing");
      const details = sessionDetails({ participations: [replacement] });

      expect(() => new Session(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenDepartedWaiterClaimsInvitation_RejectsPhantomAcceptance", () => {
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

      expect(() => new Session(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenReplacementIsNotNamedInvitee_RejectsWrongRecipient", () => {
      const inviter = refundedInvitation();
      const wrongRecipient = replacementParticipation("cara", "p-alice");
      const details = sessionDetails({
        participations: [inviter, wrongRecipient],
      });

      expect(() => new Session(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenReplacedWithdrawalIsNotRefunded_RejectsUnsettledAcceptance", () => {
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
        hold: fundHold("alice", { state: "AWAITING_REPLACEMENT" }),
      });
      const replacement = replacementParticipation("ben", "p-alice");
      const details = sessionDetails({ participations: [inviter, replacement] });

      expect(() => new Session(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenTargetWasCancelledWithoutWithdrawal_RejectsUnrelatedRefund", () => {
      const aliceCommittedAt = hoursBeforeSessionStart(48);
      const cancelledAt = hoursBeforeSessionStart(40);
      const cancelledParticipant = new Participation({
        participationId: "p-alice",
        userId: "alice",
        status: "CANCELLED",
        attendance: "UNVERIFIED",
        committedAt: aliceCommittedAt,
        hold: fundHold("alice", { state: "REFUNDED", settledAt: cancelledAt }),
      });
      const replacement = replacementParticipation("ben", "p-alice");
      const details = sessionDetails({
        participations: [cancelledParticipant, replacement],
      });

      expect(() => new Session(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenRemovedReplacementHasNoCommitmentHistory_RejectsPhantomAcceptance", () => {
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

      expect(() => new Session(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });
  });

  describe("Consumed invitation history", () => {
    test("constructor_WhenNamedReplacementCommitted_RestoresConsumedInvitation", () => {
      const inviter = refundedInvitation();
      const replacement = replacementParticipation("ben", "p-alice");
      const details = sessionDetails({ participations: [inviter, replacement] });

      const restored = new Session(details);

      expect(restored.participantList.reservedCount).toBe(0);
      expect(
        restored.participantList.personalReplacementForInvitee("ben"),
      ).toBeUndefined();
      expect(restored.participantList.committedCount).toBe(1);
      expect(restored.getAvailableSlots(hoursBeforeSessionStart(38))).toBe(1);
    });

    test("constructor_WhenAcceptedReplacementLaterWithdraws_KeepsOriginalInvitationConsumed", () => {
      const benWithdrewAt = hoursBeforeSessionStart(10);
      const availabilityCheckedAt = hoursBeforeSessionStart(9);
      const inviter = refundedInvitation();
      const withdrawnReplacement = replacementParticipation("ben", "p-alice", {
        status: "WITHDRAWN",
        withdrawnAt: benWithdrewAt,
        replacementMode: "OPEN_SLOT",
        hold: fundHold("ben", {
          state: "AWAITING_REPLACEMENT",
          createdAt: hoursBeforeSessionStart(39),
        }),
      });
      const details = sessionDetails({
        participations: [inviter, withdrawnReplacement],
      });

      const restored = new Session(details);

      expect(restored.participantList.reservedCount).toBe(0);
      expect(
        restored.participantList.personalReplacementForInvitee("ben"),
      ).toBeUndefined();
      expect(restored.participantList
        .requireParticipation("p-ben").replacesParticipationId).toBe("p-alice");
      expect(restored.getAvailableSlots(availabilityCheckedAt)).toBe(2);
    });

    test("constructor_WhenAcceptedReplacementIsRemoved_KeepsOriginalInvitationConsumed", () => {
      const benRemovedAt = hoursBeforeSessionStart(38);
      const availabilityCheckedAt = hoursBeforeSessionStart(37);
      const inviter = refundedInvitation();
      const removedReplacement = replacementParticipation("ben", "p-alice", {
        status: "REMOVED",
        hold: fundHold("ben", {
          state: "REFUNDED",
          createdAt: hoursBeforeSessionStart(39),
          settledAt: benRemovedAt,
        }),
      });
      const details = sessionDetails({
        participations: [inviter, removedReplacement],
      });

      const restored = new Session(details);

      expect(restored.participantList.reservedCount).toBe(0);
      expect(
        restored.participantList.personalReplacementForInvitee("ben"),
      ).toBeUndefined();
      expect(restored.participantList
        .requireParticipation("p-ben").replacesParticipationId).toBe("p-alice");
      expect(restored.getAvailableSlots(availabilityCheckedAt)).toBe(2);
    });

    test("constructor_WhenSessionWithAcceptedReplacementIsCancelled_RetainsReplacementHistory", () => {
      const inviter = refundedInvitation({
        status: "CANCELLED",
        replacementMode: undefined,
        replacementInviteeId: undefined,
      });
      const replacement = replacementParticipation("ben", "p-alice", {
        status: "CANCELLED",
        hold: fundHold("ben", {
          state: "REFUNDED",
          createdAt: hoursBeforeSessionStart(39),
          settledAt: hoursBeforeSessionStart(38),
        }),
      });
      const details = sessionDetails({
        status: "CANCELLED",
        participations: [inviter, replacement],
      });

      const restored = new Session(details);

      expect(restored.status).toBe("CANCELLED");
      expect(restored.participantList.reservedCount).toBe(0);
      expect(
        restored.participantList.personalReplacementForInvitee("ben"),
      ).toBeUndefined();
      expect(restored.participantList
        .requireParticipation("p-ben").replacesParticipationId).toBe("p-alice");
      expect(
        restored.participantList.requireParticipation("p-alice").hold?.state,
      ).toBe("REFUNDED");
    });
  });
});

function fundHold(
  userId: string,
  overrides: Partial<FundHoldDetails> = {},
): FundHold {
  return new FundHold({
    holdId: `h-${userId}`,
    participationId: `p-${userId}`,
    walletId: `w-${userId}`,
    holdingAccountId: "platform",
    amount: Money.fromCents(500),
    state: "HELD",
    createdAt: hoursBeforeSessionStart(48),
    ...overrides,
  });
}

function refundedInvitation(
  overrides: Partial<ParticipationDetails> = {},
): Participation {
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
    hold: fundHold("alice", { state: "REFUNDED", settledAt: aliceInvitedAt }),
    ...overrides,
  });
}

function replacementParticipation(
  userId: string,
  replacesParticipationId: string,
  overrides: Partial<ParticipationDetails> = {},
): Participation {
  const replacementCommittedAt = hoursBeforeSessionStart(39);
  return new Participation({
    participationId: `p-${userId}`,
    userId,
    status: "COMMITTED",
    attendance: "UNVERIFIED",
    committedAt: replacementCommittedAt,
    hold: fundHold(userId, { createdAt: replacementCommittedAt }),
    replacesParticipationId,
    ...overrides,
  });
}
