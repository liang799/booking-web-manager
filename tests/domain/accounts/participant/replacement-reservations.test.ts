import { ReliabilityScore } from "@/domain";
import { describe, expect, test } from "vitest";
import {
  hoursBeforeSessionStart,
  creationDetails,
  createTestUser,
  createTestSession,
  readyBooker,
  sessionState,
  sessionStartsAt,
} from "../../sessions/session/session-fixtures";

describe("Participant", () => {
  test("acceptReplacement_WhenNamedInviteeIsUnverified_AllowsReplacement", () => {
    // Input
    const bookingSession = createTestSession({
      committedUserIds: ["ben", "alex"],
    });
    createTestUser({ userId: "ben" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-ben",
        now: hoursBeforeSessionStart(10),
        replacementMode: "DIRECT_INVITE",
        replacementInviteeId: "cara",
      });
    const cara = createTestUser({
      userId: "cara",
      emailVerified: false,
    }).asParticipant();

    // Log
    const admission = cara.acceptReplacement(bookingSession, {
      participationId: "p-cara",
      holdId: "h-cara",
      now: hoursBeforeSessionStart(9),
    });
    const caraParticipation =
      bookingSession.participantList.requireParticipation("p-cara");

    // Oracle
    expect(admission.kind).toBe("COMMITTED");
    expect(caraParticipation.status).toBe("COMMITTED");
  });

  test("join_WhenNamedInviteeHasPendingInvitation_RejectsUntilExplicitAcceptance", () => {
    // Input
    const aliceWithdrawalTime = hoursBeforeSessionStart(20);
    const benWithdrawalTime = hoursBeforeSessionStart(10);
    const joinTime = hoursBeforeSessionStart(9);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
    });
    createTestUser({ userId: "alice" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-alice",
        now: aliceWithdrawalTime,
        replacementMode: "OPEN_SLOT",
      });
    createTestUser({ userId: "ben" }).asParticipant().withdraw(bookingSession, {
      participationId: "p-ben",
      now: benWithdrawalTime,
      replacementMode: "DIRECT_INVITE",
      replacementInviteeId: "cara",
    });
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      createTestUser({ userId: "cara" }).asParticipant().join(bookingSession, {
        participationId: "p-cara",
        holdId: "h-cara",
        now: joinTime,
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));

    // Log
    const currentState = sessionState(bookingSession);
    const caraParticipation =
      bookingSession.participantList.findByUserId("cara");
    const caraInvitation =
      bookingSession.participantList.personalReplacementForInvitee("cara");
    const aliceParticipation =
      bookingSession.participantList.requireParticipation("p-alice");
    const availableSlots = bookingSession.getAvailableSlots(joinTime);

    // Oracle
    expect(currentState).toEqual(previousState);
    expect(caraParticipation).toBeUndefined();
    expect(caraInvitation?.participationId).toBe("p-ben");
    expect(aliceParticipation.hold?.state).toBe("AWAITING_REPLACEMENT");
    expect(availableSlots).toBe(1);
  });

  test("acceptReplacement_WhenUserHasNoPendingInvitation_RejectsWithoutChangingReservedSeat", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(10);
    const acceptanceTime = hoursBeforeSessionStart(9);
    const bookingSession = createTestSession({
      committedUserIds: ["ben", "alex"],
    });
    createTestUser({ userId: "ben" }).asParticipant().withdraw(bookingSession, {
      participationId: "p-ben",
      now: withdrawalTime,
      replacementMode: "DIRECT_INVITE",
      replacementInviteeId: "cara",
    });
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      createTestUser({ userId: "dana" })
        .asParticipant()
        .acceptReplacement(bookingSession, {
          participationId: "p-dana",
          holdId: "h-dana",
          now: acceptanceTime,
        }),
    ).toThrow(expect.objectContaining({ code: "INVALID_ACCESS" }));

    // Log
    const currentState = sessionState(bookingSession);
    const availableSlots = bookingSession.getAvailableSlots(acceptanceTime);
    const benParticipation =
      bookingSession.participantList.requireParticipation("p-ben");

    // Oracle
    expect(currentState).toEqual(previousState);
    expect(availableSlots).toBe(0);
    expect(benParticipation.replacementInviteeId).toBe("cara");
  });

  test("acceptReplacement_WhenNamedInviteeIsBehindOtherWaiters_AcceptsOnlyTheirReservedSeat", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(10);
    const acceptanceTime = hoursBeforeSessionStart(9);
    const bookingSession = createTestSession({
      committedUserIds: ["ben", "alex"],
      waitlistedUserIds: ["dana", "cara", "evan"],
    });
    createTestUser({ userId: "ben" }).asParticipant().withdraw(bookingSession, {
      participationId: "p-ben",
      now: withdrawalTime,
      replacementMode: "DIRECT_INVITE",
      replacementInviteeId: "cara",
    });
    const queueSequence = bookingSession.participantList.nextQueueSequence;

    // Log
    const admission = createTestUser({ userId: "cara" })
      .asParticipant()
      .acceptReplacement(bookingSession, {
        participationId: "p-cara",
        holdId: "h-cara",
        now: acceptanceTime,
      });
    const cara = bookingSession.participantList.requireParticipation("p-cara");
    const nextWaiter = bookingSession.participantList.nextWaitlisted();
    const nextQueueSequence = bookingSession.participantList.nextQueueSequence;
    const committedCount = bookingSession.participantList.committedCount;
    const availableSlots = bookingSession.getAvailableSlots(acceptanceTime);

    // Oracle
    expect(admission.kind).toBe("COMMITTED");
    expect(admission.refundedParticipationId).toBe("p-ben");
    expect(
      admission.instructions.map((instruction) => instruction.kind),
    ).toEqual(["LOCK", "REFUND"]);
    expect(cara.status).toBe("COMMITTED");
    expect(cara.queueSequence).toBe(2);
    expect(cara.replacesParticipationId).toBe("p-ben");
    expect(nextWaiter?.userId).toBe("dana");
    expect(nextQueueSequence).toBe(queueSequence);
    expect(committedCount).toBe(2);
    expect(availableSlots).toBe(0);
  });

  test("acceptReplacement_WhenQueuedInviteeCannotPay_KeepsReservationAndQueuePosition", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(10);
    const acceptanceTime = hoursBeforeSessionStart(9);
    const bookingSession = createTestSession({
      committedUserIds: ["ben", "alex"],
      waitlistedUserIds: ["dana", "cara"],
    });
    createTestUser({ userId: "ben" }).asParticipant().withdraw(bookingSession, {
      participationId: "p-ben",
      now: withdrawalTime,
      replacementMode: "DIRECT_INVITE",
      replacementInviteeId: "cara",
    });
    const cara = createTestUser({
      userId: "cara",
      availableFundsCents: 499,
    }).asParticipant();
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      cara.acceptReplacement(bookingSession, {
        participationId: "p-cara",
        holdId: "h-cara",
        now: acceptanceTime,
      }),
    ).toThrow(expect.objectContaining({ code: "INSUFFICIENT_FUNDS" }));

    // Log
    const currentState = sessionState(bookingSession);
    const availableSlots = bookingSession.getAvailableSlots(acceptanceTime);
    const caraParticipation =
      bookingSession.participantList.requireParticipation("p-cara");

    // Oracle
    expect(currentState).toEqual(previousState);
    expect(availableSlots).toBe(0);
    expect(caraParticipation.queueSequence).toBe(2);
  });

  test("acceptReplacement_WhenInviteeIsInactive_RejectsWithoutChangingReservation", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(10);
    const acceptanceTime = hoursBeforeSessionStart(9);
    const bookingSession = createTestSession({
      committedUserIds: ["ben", "alex"],
    });
    createTestUser({ userId: "ben" }).asParticipant().withdraw(bookingSession, {
      participationId: "p-ben",
      replacementMode: "DIRECT_INVITE",
      replacementInviteeId: "cara",
      now: withdrawalTime,
    });
    const cara = createTestUser({
      userId: "cara",
      accountStatus: "INACTIVE",
    }).asParticipant();
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      cara.acceptReplacement(bookingSession, {
        participationId: "p-cara",
        holdId: "h-cara",
        now: acceptanceTime,
      }),
    ).toThrow(expect.objectContaining({ code: "INACTIVE_ACCOUNT" }));

    // Log
    const currentState = sessionState(bookingSession);

    // Oracle
    expect(currentState).toEqual(previousState);
  });

  test("acceptReplacement_WhenInviteeIsBelowReliabilityThreshold_RejectsWithoutChangingReservation", () => {
    // Input
    const inviterJoinTime = hoursBeforeSessionStart(48);
    const withdrawalTime = hoursBeforeSessionStart(10);
    const acceptanceTime = hoursBeforeSessionStart(9);
    const bookingSession = readyBooker().createSession({
      ...creationDetails(),
      minimumReliability: ReliabilityScore.from(80),
    });
    const ben = createTestUser({ userId: "ben" }).asParticipant();
    ben.join(bookingSession, {
      participationId: "p-ben",
      holdId: "h-ben",
      now: inviterJoinTime,
    });
    ben.withdraw(bookingSession, {
      participationId: "p-ben",
      replacementMode: "DIRECT_INVITE",
      replacementInviteeId: "cara",
      now: withdrawalTime,
    });
    const cara = createTestUser({
      userId: "cara",
      reliabilityScore: ReliabilityScore.from(79),
    }).asParticipant();
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      cara.acceptReplacement(bookingSession, {
        participationId: "p-cara",
        holdId: "h-cara",
        now: acceptanceTime,
      }),
    ).toThrow(expect.objectContaining({ code: "LOW_RELIABILITY" }));

    // Log
    const currentState = sessionState(bookingSession);

    // Oracle
    expect(currentState).toEqual(previousState);
  });

  test("acceptReplacement_WhenSessionStartsNow_RejectsUnacceptedInvitation", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(10);
    const acceptanceTime = sessionStartsAt;
    const bookingSession = createTestSession({ committedUserIds: ["ben"] });
    createTestUser({ userId: "ben" }).asParticipant().withdraw(bookingSession, {
      participationId: "p-ben",
      replacementMode: "DIRECT_INVITE",
      replacementInviteeId: "cara",
      now: withdrawalTime,
    });
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      createTestUser({ userId: "cara" })
        .asParticipant()
        .acceptReplacement(bookingSession, {
          participationId: "p-cara",
          holdId: "h-cara",
          now: acceptanceTime,
        }),
    ).toThrow(expect.objectContaining({ code: "SESSION_STARTED" }));

    // Log
    const currentState = sessionState(bookingSession);

    // Oracle
    expect(currentState).toEqual(previousState);
  });

  test("acceptReplacement_WhenInviterWasAlreadyRefunded_AcceptsSeatWithoutRefundingAnotherWithdrawal", () => {
    // Input
    const benWithdrawalTime = hoursBeforeSessionStart(40);
    const aliceWithdrawalTime = hoursBeforeSessionStart(20);
    const acceptanceTime = hoursBeforeSessionStart(19);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
    });
    createTestUser({ userId: "ben" }).asParticipant().withdraw(bookingSession, {
      participationId: "p-ben",
      now: benWithdrawalTime,
      replacementMode: "DIRECT_INVITE",
      replacementInviteeId: "cara",
    });
    createTestUser({ userId: "alice" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-alice",
        now: aliceWithdrawalTime,
        replacementMode: "OPEN_SLOT",
      });
    const refundedHold =
      bookingSession.participantList.requireParticipation("p-ben").hold;

    // Log
    const admission = createTestUser({ userId: "cara" })
      .asParticipant()
      .acceptReplacement(bookingSession, {
        participationId: "p-cara",
        holdId: "h-cara",
        now: acceptanceTime,
      });
    const caraParticipation =
      bookingSession.participantList.requireParticipation("p-cara");
    const benParticipation =
      bookingSession.participantList.requireParticipation("p-ben");
    const refundedHoldState = refundedHold?.state;
    const aliceParticipation =
      bookingSession.participantList.requireParticipation("p-alice");
    const availableSlots = bookingSession.getAvailableSlots(acceptanceTime);

    // Oracle
    expect(admission.kind).toBe("COMMITTED");
    expect(admission.refundedParticipationId).toBeUndefined();
    expect(
      admission.instructions.map((instruction) => instruction.kind),
    ).toEqual(["LOCK"]);
    expect(caraParticipation.replacesParticipationId).toBe("p-ben");
    expect(benParticipation.hold).toBe(refundedHold);
    expect(refundedHoldState).toBe("REFUNDED");
    expect(aliceParticipation.hold?.state).toBe("AWAITING_REPLACEMENT");
    expect(availableSlots).toBe(1);
  });

  test("acceptReplacement_WhenEarlyInvitationHasBeenAccepted_RejectsReplayEvenWithAnOpenSeat", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(40);
    const acceptanceTime = hoursBeforeSessionStart(39);
    const repeatAcceptanceTime = hoursBeforeSessionStart(38);
    const bookingSession = createTestSession({ committedUserIds: ["ben"] });
    createTestUser({ userId: "ben" }).asParticipant().withdraw(bookingSession, {
      participationId: "p-ben",
      now: withdrawalTime,
      replacementMode: "DIRECT_INVITE",
      replacementInviteeId: "cara",
    });
    const cara = createTestUser({ userId: "cara" }).asParticipant();
    cara.acceptReplacement(bookingSession, {
      participationId: "p-cara",
      holdId: "h-cara",
      now: acceptanceTime,
    });
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      cara.acceptReplacement(bookingSession, {
        participationId: "p-cara",
        holdId: "h-another",
        now: repeatAcceptanceTime,
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_ACCESS" }));

    // Log
    const currentState = sessionState(bookingSession);
    const committedCount = bookingSession.participantList.committedCount;
    const availableSlots =
      bookingSession.getAvailableSlots(repeatAcceptanceTime);

    // Oracle
    expect(currentState).toEqual(previousState);
    expect(committedCount).toBe(1);
    expect(availableSlots).toBe(1);
  });
});
