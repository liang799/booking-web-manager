import { Money, Session, type SessionDetails } from "@/domain";
import { describe, expect, test } from "vitest";
import {
  hoursBeforeSessionStart,
  withdrawnParticipation,
  createTestUser,
  destination,
  sessionEndsAt,
  pendingPayoutDetails,
  readyBooker,
  createTestSession,
  sessionState,
} from "../../sessions/session/session-fixtures";
import { readyBookerUser } from "../user-fixtures";

describe("Booker payout preparation", () => {
  describe("Eligibility and payout effects", () => {
    test("preparePayout_WhenRoleWasCreatedBeforeDeactivation_RejectsWithoutChangingState", () => {
      const payoutTime = sessionEndsAt;
      const bookerUser = createTestUser({
        userId: "booker",
        availableFundsCents: 0,
        payoutAccount: readyBookerUser().payoutAccount,
      });
      const booker = bookerUser.asBooker();
      bookerUser.deactivate({
        availableBalance: Money.fromCents(0),
        heldBalance: Money.fromCents(0),
        activeCommitments: 0,
        unsettledOwnedSessions: 0,
        pendingPayouts: 0,
        activeOwnedGroups: 0,
      });
      const bookingSession = createTestSession();
      const previousState = sessionState(bookingSession);

      expect(() =>
        booker.preparePayout(bookingSession, {
          payoutId: "out",
          now: payoutTime,
        }),
      ).toThrow(expect.objectContaining({ code: "INACTIVE_ACCOUNT" }));

      expect(sessionState(bookingSession)).toEqual(previousState);
    });

    test("preparePayout_WhenAttendanceIsIncomplete_RejectsWithoutChangingState", () => {
      const payoutTime = sessionEndsAt;
      const bookingSession = createTestSession({
        committedUserIds: ["alice", "ben"],
        attendanceByUserId: { alice: "ATTENDED" },
      });
      const previousState = sessionState(bookingSession);

      expect(() =>
        readyBooker().preparePayout(bookingSession, {
          payoutId: "out",
          now: payoutTime,
        }),
      ).toThrow(expect.objectContaining({ code: "ATTENDANCE_INCOMPLETE" }));

      expect(sessionState(bookingSession)).toEqual(previousState);
    });

    test("preparePayout_WhenHoldsNeedReleaseAndForfeiture_KeepsFundsPending", () => {
      const withdrawalTime = hoursBeforeSessionStart(2);
      const payoutTime = sessionEndsAt;
      const bookingSession = createTestSession({
        committedUserIds: ["alice", "ben"],
        participationOverrides: {
          alice: withdrawnParticipation("alice", {
            withdrawnAt: withdrawalTime,
            replacementMode: "OPEN_SLOT",
            holdState: "AWAITING_REPLACEMENT",
          }),
        },
        attendanceByUserId: { ben: "ATTENDED" },
        status: "AWAITING_PAYOUT",
      });

      const payout = readyBooker().preparePayout(bookingSession, {
        payoutId: "out",
        now: payoutTime,
      });

      expect(bookingSession.status).toBe("PAYOUT_PENDING");
      expect(payout?.destination).toEqual(destination);
      expect(payout).not.toHaveProperty("idempotencyKey");
      expect(bookingSession.pendingSettlement).not.toHaveProperty("idempotencyKey");
      expect(payout?.lines.map((line) => line.kind)).toEqual([
        "FORFEIT",
        "RELEASE",
      ]);
      expect(
        bookingSession.participantList.participations.map(
          (participation) => participation.hold?.state,
        ),
      ).toEqual(["FORFEITURE_DUE", "HELD"]);
    });

    test("preparePayout_WhenSessionHasNoHolds_SettlesWithoutPayout", () => {
      const payoutTime = sessionEndsAt;
      const bookingSession = createTestSession();

      const payout = readyBooker().preparePayout(bookingSession, {
        payoutId: "unused",
        now: payoutTime,
      });

      expect(payout).toBeUndefined();
      expect(bookingSession.status).toBe("SETTLED");
      expect(bookingSession.payoutAttemptIds).toEqual([]);
      expect(bookingSession.pendingSettlement).toBeUndefined();
    });
  });

  describe("Pending payouts and retry identities", () => {
    test("preparePayout_WhenAnotherPayoutIsPending_RejectsWithoutChangingState", () => {
      const payoutTime = sessionEndsAt;
      const bookingSession = new Session(pendingReleaseAndForfeitureDetails());
      const previousState = sessionState(bookingSession);

      expect(() =>
        readyBooker().preparePayout(bookingSession, {
          payoutId: "another",
          now: payoutTime,
        }),
      ).toThrow(expect.objectContaining({ code: "PAYOUT_IN_PROGRESS" }));

      expect(sessionState(bookingSession)).toEqual(previousState);
    });

    test("preparePayout_WhenFailedPayoutIdIsReused_RejectsWithoutChangingState", () => {
      const payoutTime = sessionEndsAt;
      const bookingSession = new Session(pendingReleaseAndForfeitureDetails());
      bookingSession.failSettlement("out", sessionEndsAt);
      const previousState = sessionState(bookingSession);

      expect(() =>
        readyBooker().preparePayout(bookingSession, {
          payoutId: "out",
          now: payoutTime,
        }),
      ).toThrow(expect.objectContaining({ code: "DUPLICATE_ID" }));

      expect(sessionState(bookingSession)).toEqual(previousState);
    });

    test("preparePayout_WhenFailedAttemptIsRetriedWithNewIdentity_RecordsRetry", () => {
      const payoutFailureTime = sessionEndsAt;
      const payoutTime = sessionEndsAt;
      const bookingSession = new Session(
        pendingPayoutDetails(["alice", "ben"]),
      );
      const aliceHold =
        bookingSession.participantList.requireParticipation("p-alice").hold;
      const benHold =
        bookingSession.participantList.requireParticipation("p-ben").hold;
      bookingSession.failSettlement("out", payoutFailureTime);
      const booker = readyBooker();

      const retryBatch = booker.preparePayout(bookingSession, {
        payoutId: "retry",
        now: payoutTime,
      });

      expect(retryBatch?.payoutId).toBe("retry");
      expect(bookingSession.status).toBe("PAYOUT_PENDING");
      expect(bookingSession.pendingSettlement?.payoutId).toBe("retry");
      expect(bookingSession.payoutAttemptIds).toEqual(["out", "retry"]);
      expect(
        bookingSession.participantList.requireParticipation("p-alice").hold,
      ).toBe(aliceHold);
      expect(
        bookingSession.participantList.requireParticipation("p-ben").hold,
      ).toBe(benHold);
      expect(
        bookingSession.participantList.participations.map(
          (participation) => participation.hold?.state,
        ),
      ).toEqual(["HELD", "HELD"]);
    });
  });

  describe("Replacement expiry", () => {
    test("preparePayout_WhenReplacementSweepWasMissed_ExpiresOutstandingReplacement", () => {
      const withdrawalTime = hoursBeforeSessionStart(2);
      const payoutTime = sessionEndsAt;
      const bookingSession = createTestSession({
        committedUserIds: ["alice"],
        participationOverrides: {
          alice: withdrawnParticipation("alice", {
            withdrawnAt: withdrawalTime,
            replacementMode: "OPEN_SLOT",
            holdState: "AWAITING_REPLACEMENT",
          }),
        },
      });

      const payout = readyBooker().preparePayout(bookingSession, {
        payoutId: "out",
        now: payoutTime,
      });

      expect(
        bookingSession.participantList.requireParticipation("p-alice").hold
          ?.state,
      ).toBe("FORFEITURE_DUE");
      expect(payout?.lines).toMatchObject([{ kind: "FORFEIT" }]);
    });

    test("preparePayout_WhenAttendanceIsIncomplete_LeavesExpiryUnapplied", () => {
      const withdrawalTime = hoursBeforeSessionStart(2);
      const payoutTime = sessionEndsAt;
      const bookingSession = createTestSession({
        committedUserIds: ["alice", "ben"],
        participationOverrides: {
          alice: withdrawnParticipation("alice", {
            withdrawnAt: withdrawalTime,
            replacementMode: "OPEN_SLOT",
            holdState: "AWAITING_REPLACEMENT",
          }),
        },
      });
      const command = {
        payoutId: "out",
        now: payoutTime,
      };
      const previousState = sessionState(bookingSession);

      expect(() =>
        readyBooker().preparePayout(bookingSession, command),
      ).toThrow(expect.objectContaining({ code: "ATTENDANCE_INCOMPLETE" }));

      expect(sessionState(bookingSession)).toEqual(previousState);
      expect(
        bookingSession.participantList.requireParticipation("p-alice").hold
          ?.state,
      ).toBe("AWAITING_REPLACEMENT");
    });

    test("preparePayout_WhenBookerIsForeign_LeavesExpiryAndHistoryUnapplied", () => {
      const withdrawalTime = hoursBeforeSessionStart(2);
      const payoutTime = sessionEndsAt;
      const bookingSession = createTestSession({
        committedUserIds: ["alice", "ben"],
        participationOverrides: {
          alice: withdrawnParticipation("alice", {
            withdrawnAt: withdrawalTime,
            replacementMode: "OPEN_SLOT",
            holdState: "AWAITING_REPLACEMENT",
          }),
        },
        attendanceByUserId: { ben: "ATTENDED" },
        status: "AWAITING_PAYOUT",
      });
      const command = {
        payoutId: "out",
        now: payoutTime,
      };
      const previousState = sessionState(bookingSession);

      expect(() =>
        readyBooker("foreign").preparePayout(bookingSession, command),
      ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));

      expect(sessionState(bookingSession)).toEqual(previousState);
      expect(bookingSession.payoutAttemptIds).toEqual([]);
    });

    test("preparePayout_WhenOwningBookerRetriesAfterForeignBooker_AppliesExpiryAndRecordsAttempt", () => {
      const withdrawalTime = hoursBeforeSessionStart(2);
      const payoutTime = sessionEndsAt;
      const bookingSession = createTestSession({
        committedUserIds: ["alice", "ben"],
        participationOverrides: {
          alice: withdrawnParticipation("alice", {
            withdrawnAt: withdrawalTime,
            replacementMode: "OPEN_SLOT",
            holdState: "AWAITING_REPLACEMENT",
          }),
        },
        attendanceByUserId: { ben: "ATTENDED" },
        status: "AWAITING_PAYOUT",
      });
      const command = {
        payoutId: "out",
        now: payoutTime,
      };

      // Establish a rejected foreign attempt before the owning booker retries.
      expect(() =>
        readyBooker("foreign").preparePayout(bookingSession, command),
      ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));

      const payout = readyBooker().preparePayout(bookingSession, command);

      expect(payout?.lines.map((line) => line.kind)).toEqual([
        "FORFEIT",
        "RELEASE",
      ]);
      expect(
        bookingSession.participantList.requireParticipation("p-alice").hold
          ?.state,
      ).toBe("FORFEITURE_DUE");
      expect(bookingSession.payoutAttemptIds).toEqual(["out"]);
    });
  });

  describe("Restored payout history", () => {
    test("preparePayout_WhenFailedPayoutHistoryIsRestored_RejectsReusedPayoutId", () => {
      const payoutTime = sessionEndsAt;
      const bookingSession = new Session({
        ...pendingPayoutDetails(),
        status: "AWAITING_PAYOUT",
        pendingSettlement: undefined,
      });
      const booker = readyBooker();
      const previousState = sessionState(bookingSession);

      expect(() =>
        booker.preparePayout(bookingSession, {
          payoutId: "out",
          now: payoutTime,
        }),
      ).toThrow(expect.objectContaining({ code: "DUPLICATE_ID" }));

      expect(sessionState(bookingSession)).toEqual(previousState);
    });

    test("preparePayout_WhenFailedPayoutHistoryIsRestored_AllowsNewIdentityIndependentlyOfSource", () => {
      const payoutTime = sessionEndsAt;
      const details: SessionDetails = {
        ...pendingPayoutDetails(),
        status: "AWAITING_PAYOUT",
        pendingSettlement: undefined,
      };
      const originalSession = new Session(details);
      const restoredSession = new Session(details);
      const sourceState = sessionState(originalSession);
      const booker = readyBooker();

      const retryBatch = booker.preparePayout(restoredSession, {
        payoutId: "retry",
        now: payoutTime,
      });

      expect(retryBatch?.payoutId).toBe("retry");
      expect(restoredSession.status).toBe("PAYOUT_PENDING");
      expect(restoredSession.pendingSettlement?.payoutId).toBe("retry");
      expect(restoredSession.payoutAttemptIds).toEqual(["out", "retry"]);
      expect(sessionState(originalSession)).toEqual(sourceState);
    });
  });
});

/** Pending payout with Alice's late withdrawal and Ben's attended share. */
function pendingReleaseAndForfeitureDetails(): SessionDetails {
  const details = pendingPayoutDetails(["alice", "ben"]);
  const ben = details.participations[1]!;
  const withdrawnAlice = withdrawnParticipation("alice", {
    withdrawnAt: hoursBeforeSessionStart(2),
    replacementMode: "OPEN_SLOT",
    holdState: "FORFEITURE_DUE",
  });
  const pendingSettlement = details.pendingSettlement!;
  return {
    ...details,
    participations: [withdrawnAlice, ben],
    pendingSettlement: {
      ...pendingSettlement,
      lines: [
        { ...pendingSettlement.lines[0]!, kind: "FORFEIT" },
        pendingSettlement.lines[1]!,
      ],
    },
  };
}
