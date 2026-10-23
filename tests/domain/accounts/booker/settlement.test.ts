import { Money, Participation, Session, type SessionDetails } from "@/domain";
import { describe, expect, test } from "vitest";
import {
  hoursBeforeSessionStart,
  createTestUser,
  destination,
  sessionEndsAt,
  pendingPayoutDetails,
  readyBooker,
  createTestSession,
  sessionState,
} from "../../sessions/session/session-fixtures";
import { readyBookerUser } from "../user-fixtures";

describe("Booker", () => {
  test("preparePayout_WhenRoleWasCreatedBeforeDeactivation_RejectsWithoutChangingState", () => {
    // Input
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

    // Log & Oracle
    expect(() =>
      booker.preparePayout(bookingSession, {
        payoutId: "out",
        idempotencyKey: "key",
        now: payoutTime,
      }),
    ).toThrow(expect.objectContaining({ code: "INACTIVE_ACCOUNT" }));

    // Log
    const currentState = sessionState(bookingSession);

    // Oracle
    expect(currentState).toEqual(previousState);
  });

  test("preparePayout_WhenAttendanceIsIncomplete_RejectsWithoutChangingState", () => {
    // Input
    const attendanceVerificationTime = sessionEndsAt;
    const payoutTime = sessionEndsAt;
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
    });
    readyBooker().verifyAttendance(bookingSession, {
      marks: [{ participationId: "p-alice", attendance: "ATTENDED" }],
      now: attendanceVerificationTime,
    });
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      readyBooker().preparePayout(bookingSession, {
        payoutId: "out",
        idempotencyKey: "key",
        now: payoutTime,
      }),
    ).toThrow(expect.objectContaining({ code: "ATTENDANCE_INCOMPLETE" }));

    // Log
    const currentState = sessionState(bookingSession);

    // Oracle
    expect(currentState).toEqual(previousState);
  });

  test("preparePayout_WhenHoldsNeedReleaseAndForfeiture_KeepsFundsPending", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(2);
    const attendanceVerificationTime = sessionEndsAt;
    const payoutTime = sessionEndsAt;
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
    });
    createTestUser({ userId: "alice" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-alice",
        now: withdrawalTime,
      });
    readyBooker().verifyAttendance(bookingSession, {
      marks: [{ participationId: "p-ben", attendance: "ATTENDED" }],
      now: attendanceVerificationTime,
    });

    // Log
    const payout = readyBooker().preparePayout(bookingSession, {
      payoutId: "out",
      idempotencyKey: "key",
      now: payoutTime,
    });
    const sessionStatus = bookingSession.status;
    const participations = bookingSession.participantList.participations;

    // Oracle
    expect(sessionStatus).toBe("PAYOUT_PENDING");
    expect(payout?.destination).toEqual(destination);
    expect(payout?.lines.map((line) => line.kind)).toEqual([
      "FORFEIT",
      "RELEASE",
    ]);
    expect(
      participations.map((participation) => participation.hold?.state),
    ).toEqual(["FORFEITURE_DUE", "HELD"]);
  });

  test("preparePayout_WhenAnotherPayoutIsPending_RejectsWithoutChangingState", () => {
    // Input
    const payoutTime = sessionEndsAt;
    const bookingSession = new Session(pendingReleaseAndForfeitureDetails());
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      readyBooker().preparePayout(bookingSession, {
        payoutId: "another",
        idempotencyKey: "key2",
        now: payoutTime,
      }),
    ).toThrow(expect.objectContaining({ code: "PAYOUT_IN_PROGRESS" }));

    // Log
    const currentState = sessionState(bookingSession);

    // Oracle
    expect(currentState).toEqual(previousState);
  });

  test("preparePayout_WhenFailedPayoutIdIsReused_RejectsWithoutChangingState", () => {
    // Input
    const payoutTime = sessionEndsAt;
    const bookingSession = new Session(pendingReleaseAndForfeitureDetails());
    bookingSession.failSettlement("out", sessionEndsAt);
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      readyBooker().preparePayout(bookingSession, {
        payoutId: "out",
        idempotencyKey: "new",
        now: payoutTime,
      }),
    ).toThrow(expect.objectContaining({ code: "DUPLICATE_ID" }));

    // Log
    const currentState = sessionState(bookingSession);

    // Oracle
    expect(currentState).toEqual(previousState);
  });

  test("preparePayout_WhenFailedPayoutKeyIsReusedWithNewPayoutId_RejectsWithoutChangingState", () => {
    // Input
    const payoutTime = sessionEndsAt;
    const bookingSession = new Session(pendingPayoutDetails(["alice", "ben"]));
    bookingSession.failSettlement("out", sessionEndsAt);
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      readyBooker().preparePayout(bookingSession, {
        payoutId: "retry",
        idempotencyKey: "key",
        now: payoutTime,
      }),
    ).toThrow(
      expect.objectContaining({
        code: "DUPLICATE_ID",
        message:
          "A payout idempotency key can only be used once for this session",
      }),
    );

    // Log
    const currentState = sessionState(bookingSession);

    // Oracle
    expect(currentState).toEqual(previousState);
  });

  test("preparePayout_WhenFailedAttemptIsRetriedWithNewIdentity_RecordsRetry", () => {
    // Input
    const payoutFailureTime = sessionEndsAt;
    const payoutTime = sessionEndsAt;
    const bookingSession = new Session(pendingPayoutDetails(["alice", "ben"]));
    const aliceHold =
      bookingSession.participantList.requireParticipation("p-alice").hold;
    const benHold =
      bookingSession.participantList.requireParticipation("p-ben").hold;
    bookingSession.failSettlement("out", payoutFailureTime);
    const booker = readyBooker();

    // Log
    const retryBatch = booker.preparePayout(bookingSession, {
      payoutId: "retry",
      idempotencyKey: "retry-key",
      now: payoutTime,
    });
    const sessionStatus = bookingSession.status;
    const pendingSettlement = bookingSession.pendingSettlement;
    const payoutAttemptIds = bookingSession.payoutAttemptIds;
    const payoutIdempotencyKeys = bookingSession.payoutIdempotencyKeys;
    const aliceParticipation =
      bookingSession.participantList.requireParticipation("p-alice");
    const benParticipation =
      bookingSession.participantList.requireParticipation("p-ben");
    const participations = bookingSession.participantList.participations;

    // Oracle
    expect(retryBatch?.payoutId).toBe("retry");
    expect(retryBatch?.idempotencyKey).toBe("retry-key");
    expect(sessionStatus).toBe("PAYOUT_PENDING");
    expect(pendingSettlement?.payoutId).toBe("retry");
    expect(payoutAttemptIds).toEqual(["out", "retry"]);
    expect(payoutIdempotencyKeys).toEqual(["key", "retry-key"]);
    expect(aliceParticipation.hold).toBe(aliceHold);
    expect(benParticipation.hold).toBe(benHold);
    expect(
      participations.map((participation) => participation.hold?.state),
    ).toEqual(["HELD", "HELD"]);
  });

  test("preparePayout_WhenSessionHasNoHolds_SettlesWithoutPayout", () => {
    // Input
    const payoutTime = sessionEndsAt;
    const bookingSession = createTestSession();

    // Log
    const payout = readyBooker().preparePayout(bookingSession, {
      payoutId: "unused",
      idempotencyKey: "unused",
      now: payoutTime,
    });
    const status = bookingSession.status;

    // Oracle
    expect(payout).toBeUndefined();
    expect(status).toBe("SETTLED");
  });

  test("preparePayout_WhenReplacementSweepWasMissed_ExpiresOutstandingReplacement", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(2);
    const payoutTime = sessionEndsAt;
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });
    createTestUser({ userId: "alice" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-alice",
        now: withdrawalTime,
      });

    // Log
    const payout = readyBooker().preparePayout(bookingSession, {
      payoutId: "out",
      idempotencyKey: "key",
      now: payoutTime,
    });
    const aliceParticipation =
      bookingSession.participantList.requireParticipation("p-alice");

    // Oracle
    expect(aliceParticipation.hold?.state).toBe("FORFEITURE_DUE");
    expect(payout?.lines).toMatchObject([{ kind: "FORFEIT" }]);
  });

  test("preparePayout_WhenAttendanceIsIncomplete_LeavesExpiryUnapplied", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(2);
    const payoutTime = sessionEndsAt;
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
    });
    createTestUser({ userId: "alice" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-alice",
        now: withdrawalTime,
      });
    const command = {
      payoutId: "out",
      idempotencyKey: "key",
      now: payoutTime,
    };
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() => readyBooker().preparePayout(bookingSession, command)).toThrow(
      expect.objectContaining({ code: "ATTENDANCE_INCOMPLETE" }),
    );

    // Log
    const currentState = sessionState(bookingSession);
    const aliceParticipation =
      bookingSession.participantList.requireParticipation("p-alice");

    // Oracle
    expect(currentState).toEqual(previousState);
    expect(aliceParticipation.hold?.state).toBe("AWAITING_REPLACEMENT");
  });

  test("preparePayout_WhenBookerIsForeign_LeavesExpiryAndHistoryUnapplied", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(2);
    const attendanceVerificationTime = sessionEndsAt;
    const payoutTime = sessionEndsAt;
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
    });
    createTestUser({ userId: "alice" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-alice",
        now: withdrawalTime,
      });
    readyBooker().verifyAttendance(bookingSession, {
      marks: [{ participationId: "p-ben", attendance: "ATTENDED" }],
      now: attendanceVerificationTime,
    });
    const command = {
      payoutId: "out",
      idempotencyKey: "key",
      now: payoutTime,
    };
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      readyBooker("foreign").preparePayout(bookingSession, command),
    ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));

    // Log
    const currentState = sessionState(bookingSession);
    const payoutAttemptIds = bookingSession.payoutAttemptIds;
    const payoutIdempotencyKeys = bookingSession.payoutIdempotencyKeys;

    // Oracle
    expect(currentState).toEqual(previousState);
    expect(payoutAttemptIds).toEqual([]);
    expect(payoutIdempotencyKeys).toEqual([]);
  });

  test("preparePayout_WhenOwningBookerRetriesAfterForeignBooker_AppliesExpiryAndRecordsAttempt", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(2);
    const attendanceVerificationTime = sessionEndsAt;
    const payoutTime = sessionEndsAt;
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
    });
    createTestUser({ userId: "alice" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-alice",
        now: withdrawalTime,
      });
    readyBooker().verifyAttendance(bookingSession, {
      marks: [{ participationId: "p-ben", attendance: "ATTENDED" }],
      now: attendanceVerificationTime,
    });
    const command = {
      payoutId: "out",
      idempotencyKey: "key",
      now: payoutTime,
    };

    // Establish a rejected foreign attempt before the owning booker retries.
    expect(() =>
      readyBooker("foreign").preparePayout(bookingSession, command),
    ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));

    // Log
    const payout = readyBooker().preparePayout(bookingSession, command);
    const aliceParticipation =
      bookingSession.participantList.requireParticipation("p-alice");
    const payoutAttemptIds = bookingSession.payoutAttemptIds;
    const payoutIdempotencyKeys = bookingSession.payoutIdempotencyKeys;

    // Oracle
    expect(payout?.lines.map((line) => line.kind)).toEqual([
      "FORFEIT",
      "RELEASE",
    ]);
    expect(aliceParticipation.hold?.state).toBe("FORFEITURE_DUE");
    expect(payoutAttemptIds).toEqual(["out"]);
    expect(payoutIdempotencyKeys).toEqual(["key"]);
  });

  test("preparePayout_WhenFailedPayoutHistoryIsRestored_RejectsReusedPayoutId", () => {
    // Input
    const payoutTime = sessionEndsAt;
    const bookingSession = new Session({
      ...pendingPayoutDetails(),
      status: "AWAITING_PAYOUT",
      pendingSettlement: undefined,
    });
    const booker = readyBooker();
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      booker.preparePayout(bookingSession, {
        payoutId: "out",
        idempotencyKey: "retry-key",
        now: payoutTime,
      }),
    ).toThrow(expect.objectContaining({ code: "DUPLICATE_ID" }));

    // Log
    const currentState = sessionState(bookingSession);

    // Oracle
    expect(currentState).toEqual(previousState);
  });

  test("preparePayout_WhenFailedPayoutHistoryIsRestored_RejectsReusedIdempotencyKey", () => {
    // Input
    const payoutTime = sessionEndsAt;
    const bookingSession = new Session({
      ...pendingPayoutDetails(),
      status: "AWAITING_PAYOUT",
      pendingSettlement: undefined,
    });
    const booker = readyBooker();
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      booker.preparePayout(bookingSession, {
        payoutId: "retry",
        idempotencyKey: "key",
        now: payoutTime,
      }),
    ).toThrow(expect.objectContaining({ code: "DUPLICATE_ID" }));

    // Log
    const currentState = sessionState(bookingSession);

    // Oracle
    expect(currentState).toEqual(previousState);
  });

  test("preparePayout_WhenFailedPayoutHistoryIsRestored_AllowsNewIdentityIndependentlyOfSource", () => {
    // Input
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

    // Log
    const retryBatch = booker.preparePayout(restoredSession, {
      payoutId: "retry",
      idempotencyKey: "retry-key",
      now: payoutTime,
    });
    const sessionStatus = restoredSession.status;
    const currentPendingSettlement = restoredSession.pendingSettlement;
    const payoutAttemptIds = restoredSession.payoutAttemptIds;
    const payoutIdempotencyKeys = restoredSession.payoutIdempotencyKeys;
    const currentState = sessionState(originalSession);

    // Oracle
    expect(retryBatch?.payoutId).toBe("retry");
    expect(retryBatch?.idempotencyKey).toBe("retry-key");
    expect(sessionStatus).toBe("PAYOUT_PENDING");
    expect(currentPendingSettlement?.payoutId).toBe("retry");
    expect(payoutAttemptIds).toEqual(["out", "retry"]);
    expect(payoutIdempotencyKeys).toEqual(["key", "retry-key"]);
    expect(currentState).toEqual(sourceState);
  });
});

/** Pending payout with Alice's late withdrawal and Ben's attended share. */
function pendingReleaseAndForfeitureDetails(): SessionDetails {
  const details = pendingPayoutDetails(["alice", "ben"]);
  const [alice, ben] = details.participations;
  const withdrawnAlice = new Participation({
    participationId: "p-alice",
    userId: "alice",
    status: "WITHDRAWN",
    attendance: "UNVERIFIED",
    committedAt: hoursBeforeSessionStart(48),
    withdrawnAt: hoursBeforeSessionStart(2),
    replacementMode: "OPEN_SLOT",
    hold: alice!.hold!.awaitReplacement().markForfeitureDue(sessionEndsAt),
  });
  const pendingSettlement = details.pendingSettlement!;
  return {
    ...details,
    participations: [withdrawnAlice, ben!],
    pendingSettlement: {
      ...pendingSettlement,
      lines: [
        { ...pendingSettlement.lines[0]!, kind: "FORFEIT" },
        pendingSettlement.lines[1]!,
      ],
    },
  };
}
