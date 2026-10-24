import { Money, Session } from "@/domain";
import { describe, expect, test } from "vitest";
import {
  cancelledParticipation,
  createTestSession,
  hoursBeforeSessionStart,
  leftWaitlistedParticipation,
  pendingPayoutDetails,
  removedParticipation,
  sessionEndsAt,
  withdrawnParticipation,
} from "./session-fixtures";

describe("Session fixture contracts", () => {
  describe("Roster construction", () => {
    test("createTestSession_WhenOnlyOneAttendanceMarkIsProvided_LeavesOtherUsersUnverified", () => {
      const session = createTestSession({
        committedUserIds: ["alice", "ben"],
        attendanceByUserId: { alice: "ABSENT" },
      });

      const alice = session.participantList.requireParticipation("p-alice");
      const ben = session.participantList.requireParticipation("p-ben");

      expect(session.status).toBe("OPEN");
      expect(alice.attendance).toBe("ABSENT");
      expect(alice.verifiedAt).toEqual(sessionEndsAt);
      expect(alice.verificationMethod).toBe("BOOKER");
      expect(ben.attendance).toBe("UNVERIFIED");
      expect(ben.verifiedAt).toBeUndefined();
    });

    test("createTestSession_WhenCostDoesNotDivideEvenly_HydratesRoundedShares", () => {
      const session = createTestSession({
        totalSlots: 3,
        committedUserIds: ["alice", "ben"],
        attendanceByUserId: { ben: "ATTENDED" },
      });

      const amounts = session.participantList.participations.map(
        (participation) => participation.hold?.amount.toCents(),
      );

      expect(session.bookingShare.toCents()).toBe(333);
      expect(amounts).toEqual([333, 333]);
    });

    test("createTestSession_WhenCustomShareIsProvided_UsesItForEveryHeldShare", () => {
      const session = createTestSession({
        bookingShare: Money.fromCents(750),
        committedUserIds: ["alice", "ben"],
        attendanceByUserId: { ben: "ATTENDED" },
      });

      const amounts = session.participantList.participations.map(
        (participation) => participation.hold?.amount.toCents(),
      );

      expect(session.bookingShare.toCents()).toBe(750);
      expect(amounts).toEqual([750, 750]);
    });

    test("createTestSession_WhenRosterEntryIsOverridden_PreservesItsPositionAndQueueMetadata", () => {
      const withdrawn = withdrawnParticipation("alice", {
        withdrawnAt: hoursBeforeSessionStart(10),
        replacementMode: "OPEN_SLOT",
        holdState: "AWAITING_REPLACEMENT",
      });

      const session = createTestSession({
        committedUserIds: ["alice", "ben"],
        waitlistedUserIds: ["cara", "dan"],
        participationOverrides: { alice: withdrawn },
      });

      expect(session.participantList.participations.map((entry) => entry.userId))
        .toEqual(["alice", "ben", "cara", "dan"]);
      expect(session.participantList.requireParticipation("p-alice")).toBe(withdrawn);
      expect(session.participantList.requireParticipation("p-cara").queueSequence).toBe(1);
      expect(session.participantList.requireParticipation("p-dan").queueSequence).toBe(2);
      expect(session.participantList.nextQueueSequence).toBe(3);
    });

    test("createTestSession_WhenOverrideUserIsOutsideRoster_RejectsTheOverride", () => {
      const outsider = leftWaitlistedParticipation("outsider", 1);

      expect(() => createTestSession({
        committedUserIds: ["alice"],
        participationOverrides: { outsider },
      })).toThrow("Participation override must match a roster user: outsider");
    });

    test("createTestSession_WhenOverrideIdentityDoesNotMatchItsKey_RejectsTheOverride", () => {
      const ben = leftWaitlistedParticipation("ben", 1);

      expect(() => createTestSession({
        waitlistedUserIds: ["alice"],
        participationOverrides: { alice: ben },
      })).toThrow("Participation override must match a roster user: alice");
    });

    test("createTestSession_WhenCalledTwice_CreatesIndependentRostersAndHolds", () => {
      const first = createTestSession({ committedUserIds: ["alice"] });

      const second = createTestSession({ committedUserIds: ["alice"] });

      expect(second).not.toBe(first);
      expect(second.participantList.requireParticipation("p-alice"))
        .not.toBe(first.participantList.requireParticipation("p-alice"));
      expect(second.participantList.requireParticipation("p-alice").hold)
        .not.toBe(first.participantList.requireParticipation("p-alice").hold);
    });
  });

  describe("Existing history and payout data", () => {
    test("withdrawnParticipation_WhenRefundedWithCustomTerms_PreservesHistoryAndFinancialIdentity", () => {
      const withdrawalTime = hoursBeforeSessionStart(40);

      const withdrawn = withdrawnParticipation("alice", {
        withdrawnAt: withdrawalTime,
        holdState: "REFUNDED",
        replacesParticipationId: "previous-participation",
      }, { holdingAccountId: "custom-platform", bookingShare: Money.fromCents(750) });

      expect(withdrawn.status).toBe("WITHDRAWN");
      expect(withdrawn.replacesParticipationId).toBe("previous-participation");
      expect(withdrawn.hold?.holdingAccountId).toBe("custom-platform");
      expect(withdrawn.hold?.amount.toCents()).toBe(750);
      expect(withdrawn.hold?.state).toBe("REFUNDED");
      expect(withdrawn.hold?.settledAt).toEqual(withdrawalTime);
    });

    test("withdrawnParticipation_WhenAwaitingNamedReplacement_PreservesReservationWithoutSettlement", () => {
      const withdrawn = withdrawnParticipation("alice", {
        withdrawnAt: hoursBeforeSessionStart(10),
        replacementMode: "DIRECT_INVITE",
        replacementInviteeId: "ben",
        holdState: "AWAITING_REPLACEMENT",
      });

      expect(withdrawn.replacementMode).toBe("DIRECT_INVITE");
      expect(withdrawn.replacementInviteeId).toBe("ben");
      expect(withdrawn.hold?.amount.toCents()).toBe(500);
      expect(withdrawn.hold?.state).toBe("AWAITING_REPLACEMENT");
      expect(withdrawn.hold?.settledAt).toBeUndefined();
    });

    test("removedParticipation_WhenReplacementWasRemoved_PreservesRefundTimeAndReplacementLink", () => {
      const refundTime = hoursBeforeSessionStart(38);

      const removed = removedParticipation("ben", {
        settledAt: refundTime,
        replacesParticipationId: "p-alice",
      });

      expect(removed.status).toBe("REMOVED");
      expect(removed.replacesParticipationId).toBe("p-alice");
      expect(removed.hold?.state).toBe("REFUNDED");
      expect(removed.hold?.settledAt).toEqual(refundTime);
    });

    test("cancelledParticipation_WhenReplacementWasCancelled_PreservesRefundTimeAndReplacementLink", () => {
      const refundTime = hoursBeforeSessionStart(38);

      const cancelled = cancelledParticipation("ben", {
        settledAt: refundTime,
        replacesParticipationId: "p-alice",
      });

      expect(cancelled.status).toBe("CANCELLED");
      expect(cancelled.replacesParticipationId).toBe("p-alice");
      expect(cancelled.hold?.state).toBe("REFUNDED");
      expect(cancelled.hold?.settledAt).toEqual(refundTime);
    });

    test("leftWaitlistedParticipation_WhenQueueEntryIsClosed_PreservesQueueWithoutAHold", () => {
      const waitingTime = hoursBeforeSessionStart(42);

      const departed = leftWaitlistedParticipation("cara", 7, waitingTime);

      expect(departed.status).toBe("LEFT_WAITLIST");
      expect(departed.queueSequence).toBe(7);
      expect(departed.waitlistedAt).toEqual(waitingTime);
      expect(departed.hold).toBeUndefined();
    });

    test("pendingPayoutDetails_WhenOptionsAreOmitted_PreservesExistingFixtureDefaults", () => {
      const details = pendingPayoutDetails();

      const session = new Session(details);

      expect(session.pendingSettlement?.payoutId).toBe("out");
      expect(session.pendingSettlement).not.toHaveProperty("idempotencyKey");
      expect(session.pendingSettlement?.lines[0]?.amount.toCents()).toBe(500);
      expect(session.payoutAttemptIds).toEqual(["out"]);
      expect(session).not.toHaveProperty("payoutIdempotencyKeys");
    });

    test("pendingPayoutDetails_WhenTermsAndIdentityAreProvided_HydratesMatchingPayoutHistory", () => {
      const details = pendingPayoutDetails(["alice", "ben"], {
        bookingShare: Money.fromCents(750),
        payoutId: "original-payout",
      });

      const session = new Session(details);

      expect(session.status).toBe("PAYOUT_PENDING");
      expect(session.pendingSettlement?.payoutId).toBe("original-payout");
      expect(session.pendingSettlement).not.toHaveProperty("idempotencyKey");
      expect(session.pendingSettlement?.lines.map((line) => line.amount.toCents()))
        .toEqual([750, 750]);
      expect(session.participantList.participations.map((entry) => entry.hold?.amount.toCents()))
        .toEqual([750, 750]);
      expect(session.payoutAttemptIds).toEqual(["original-payout"]);
      expect(session).not.toHaveProperty("payoutIdempotencyKeys");
    });
  });
});
