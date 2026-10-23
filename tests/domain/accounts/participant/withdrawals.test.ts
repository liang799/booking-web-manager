import { describe, expect, test } from "vitest";
import {
  hoursBeforeSessionStart,
  createTestUser,
  createTestSession,
  sessionState,
  sessionStartsAt,
} from "../../sessions/session/session-fixtures";

describe("Participant", () => {
  test("withdraw_WhenCommittedBeforeRefundCutoff_RefundsParticipant", () => {
    // Input
    const participant = createTestUser({
      userId: "participant",
    }).asParticipant();
    const session = createTestSession({ committedUserIds: ["participant"] });

    // Log
    const withdrawal = participant.withdraw(session, {
      participationId: "p-participant",
      now: hoursBeforeSessionStart(31),
    });

    const withdrawn =
      session.participantList.requireParticipation("p-participant");

    // Oracle
    expect(withdrawal.kind).toBe("REFUNDED");
    expect(withdrawn.userId).toBe(participant.userId);
    expect(withdrawn.status).toBe("WITHDRAWN");
    expect(withdrawn.hold?.state).toBe("REFUNDED");
    expect(withdrawal.instructions).toEqual([
      expect.objectContaining({
        kind: "REFUND",
        participationId: "p-participant",
        holdId: "h-participant",
        walletId: "w-participant",
      }),
    ]);
    expect(withdrawal.instructions[0]?.amount.toCents()).toBe(500);
  });

  test("withdraw_WhenParticipantIsUnverified_StillRefundsAnExistingEarlyCommitment", () => {
    // Input
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });
    const alice = createTestUser({
      userId: "alice",
      emailVerified: false,
    }).asParticipant();

    // Log
    const withdrawal = alice.withdraw(bookingSession, {
      participationId: "p-alice",
      now: hoursBeforeSessionStart(48),
    });

    // Oracle
    expect(withdrawal.kind).toBe("REFUNDED");
    expect(withdrawal.instructions[0]?.kind).toBe("REFUND");
    expect(withdrawal.instructions[0]?.amount.toCents()).toBe(500);
    expect(
      bookingSession.participantList.requireParticipation("p-alice").status,
    ).toBe("WITHDRAWN");
  });

  test("withdraw_WhenParticipantDirectlyInvitesSomeone_ReservesSeatWithoutCommittingInviteeOrRefunding", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(10);
    const bookingSession = createTestSession({
      committedUserIds: ["ben", "alex"],
    });

    // Log
    const withdrawal = createTestUser({ userId: "ben" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-ben",
        replacementMode: "DIRECT_INVITE",
        replacementInviteeId: "cara",
        now: withdrawalTime,
      });

    // Oracle
    expect(withdrawal.kind).toBe("AWAITING_REPLACEMENT");
    expect(withdrawal.instructions).toEqual([]);
    expect(bookingSession.participantList.findByUserId("cara")).toBeUndefined();
    expect(
      bookingSession.participantList.requireParticipation("p-ben").hold?.state,
    ).toBe("AWAITING_REPLACEMENT");
    expect(
      bookingSession.participantList.personalReplacementForInvitee("cara")
        ?.participationId,
    ).toBe("p-ben");
    expect(bookingSession.participantList.committedCount).toBe(1);
    expect(bookingSession.participantList.reservedCount).toBe(1);
    expect(bookingSession.getAvailableSlots(withdrawalTime)).toBe(0);
  });

  test("withdraw_WhenInviteeAlreadyWaits_KeepsTheirQueueEntryUntilTheyAccept", () => {
    // Input
    const bookingSession = createTestSession({
      committedUserIds: ["ben", "alex"],
      waitlistedUserIds: ["dana", "cara"],
    });
    const waiting =
      bookingSession.participantList.requireParticipation("p-cara");
    const queueSequence = bookingSession.participantList.nextQueueSequence;

    // Log
    const withdrawal = createTestUser({ userId: "ben" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-ben",
        replacementMode: "DIRECT_INVITE",
        replacementInviteeId: "cara",
        now: hoursBeforeSessionStart(10),
      });

    // Oracle
    expect(withdrawal.instructions).toEqual([]);
    expect(bookingSession.participantList.requireParticipation("p-cara")).toBe(
      waiting,
    );
    expect(waiting.status).toBe("WAITLISTED");
    expect(waiting.hold).toBeUndefined();
    expect(waiting.queueSequence).toBe(2);
    expect(bookingSession.participantList.nextWaitlisted()?.userId).toBe(
      "dana",
    );
    expect(bookingSession.participantList.nextQueueSequence).toBe(
      queueSequence,
    );
    expect(bookingSession.participantList.reservedCount).toBe(1);
  });

  test("withdraw_WhenParticipantChoseInvitation_RejectsSwitchToWaitlistAndKeepsReservedSeat", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(10);
    const choiceChangeTime = hoursBeforeSessionStart(9);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
      waitlistedUserIds: ["dana"],
    });
    const alice = createTestUser({ userId: "alice" }).asParticipant();
    alice.withdraw(bookingSession, {
      participationId: "p-alice",
      now: withdrawalTime,
      replacementMode: "DIRECT_INVITE",
      replacementInviteeId: "cara",
    });
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      alice.withdraw(bookingSession, {
        participationId: "p-alice",
        now: choiceChangeTime,
        replacementMode: "OPEN_SLOT",
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));
    expect(sessionState(bookingSession)).toEqual(previousState);
    const withdrawn =
      bookingSession.participantList.requireParticipation("p-alice");
    expect(withdrawn.replacementMode).toBe("DIRECT_INVITE");
    expect(withdrawn.replacementInviteeId).toBe("cara");
    expect(bookingSession.getAvailableSlots(choiceChangeTime)).toBe(0);
    expect(bookingSession.participantList.nextWaitlisted()?.userId).toBe(
      "dana",
    );
  });

  test("withdraw_WhenParticipantChoseWaitlist_RejectsSwitchToInvitationAndKeepsOpenSeat", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(10);
    const choiceChangeTime = hoursBeforeSessionStart(9);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
      waitlistedUserIds: ["dana"],
    });
    const alice = createTestUser({ userId: "alice" }).asParticipant();
    alice.withdraw(bookingSession, {
      participationId: "p-alice",
      now: withdrawalTime,
      replacementMode: "OPEN_SLOT",
    });
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      alice.withdraw(bookingSession, {
        participationId: "p-alice",
        now: choiceChangeTime,
        replacementMode: "DIRECT_INVITE",
        replacementInviteeId: "cara",
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));
    expect(sessionState(bookingSession)).toEqual(previousState);
    const withdrawn =
      bookingSession.participantList.requireParticipation("p-alice");
    expect(withdrawn.replacementMode).toBe("OPEN_SLOT");
    expect(withdrawn.replacementInviteeId).toBeUndefined();
    expect(bookingSession.getAvailableSlots(choiceChangeTime)).toBe(1);
    expect(bookingSession.participantList.nextWaitlisted()?.userId).toBe(
      "dana",
    );
  });

  test("withdraw_WhenOneMillisecondBeforeRefundCutoff_RefundsHold", () => {
    // Input
    const refundCutoff = hoursBeforeSessionStart(30);
    const oneMillisecondBeforeRefundCutoff = new Date(
      refundCutoff.getTime() - 1,
    );
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });

    // Log
    const withdrawal = createTestUser({ userId: "alice" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-alice",
        now: oneMillisecondBeforeRefundCutoff,
      });

    // Oracle
    expect(withdrawal.kind).toBe("REFUNDED");
    expect(
      bookingSession.participantList.requireParticipation("p-alice").hold
        ?.state,
    ).toBe("REFUNDED");
  });

  test("withdraw_WhenEarlyParticipantInvitesOnePerson_RefundsAndReservesTheirSeat", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(40);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
    });

    // Log
    const withdrawal = createTestUser({ userId: "alice" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-alice",
        now: withdrawalTime,
        replacementMode: "DIRECT_INVITE",
        replacementInviteeId: "cara",
      });

    const withdrawn =
      bookingSession.participantList.requireParticipation("p-alice");

    // Oracle
    expect(withdrawal.kind).toBe("REFUNDED");
    expect(
      withdrawal.instructions.map((instruction) => instruction.kind),
    ).toEqual(["REFUND"]);
    expect(withdrawn.replacementMode).toBe("DIRECT_INVITE");
    expect(withdrawn.replacementInviteeId).toBe("cara");
    expect(withdrawn.hold?.state).toBe("REFUNDED");
    expect(bookingSession.getAvailableSlots(withdrawalTime)).toBe(0);
  });

  test("withdraw_WhenParticipantAlreadyInvitedSomeone_RejectsSecondInvitation", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(10);
    const secondInvitationTime = hoursBeforeSessionStart(9);
    const bookingSession = createTestSession({
      committedUserIds: ["ben", "alex"],
    });
    const ben = createTestUser({ userId: "ben" }).asParticipant();
    ben.withdraw(bookingSession, {
      participationId: "p-ben",
      now: withdrawalTime,
      replacementMode: "DIRECT_INVITE",
      replacementInviteeId: "cara",
    });
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      ben.withdraw(bookingSession, {
        participationId: "p-ben",
        now: secondInvitationTime,
        replacementMode: "DIRECT_INVITE",
        replacementInviteeId: "dana",
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));
    expect(sessionState(bookingSession)).toEqual(previousState);
    expect(
      bookingSession.participantList.personalReplacementForInvitee("cara")
        ?.replacementInviteeId,
    ).toBe("cara");
    expect(
      bookingSession.participantList.personalReplacementForInvitee("dana"),
    ).toBeUndefined();
    expect(bookingSession.participantList.reservedCount).toBe(1);
    expect(bookingSession.getAvailableSlots(secondInvitationTime)).toBe(0);
  });

  test("withdraw_WhenNamedRecipientIsMissing_RejectsWithoutChangingState", () => {
    // Input
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      createTestUser({ userId: "alice" })
        .asParticipant()
        .withdraw(bookingSession, {
          participationId: "p-alice",
          now: hoursBeforeSessionStart(40),
          replacementMode: "DIRECT_INVITE",
        }),
    ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    expect(sessionState(bookingSession)).toEqual(previousState);
  });

  test("withdraw_WhenParticipantInvitesThemself_RejectsWithoutChangingState", () => {
    // Input
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      createTestUser({ userId: "alice" })
        .asParticipant()
        .withdraw(bookingSession, {
          participationId: "p-alice",
          now: hoursBeforeSessionStart(10),
          replacementMode: "DIRECT_INVITE",
          replacementInviteeId: "alice",
        }),
    ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    expect(sessionState(bookingSession)).toEqual(previousState);
  });

  test("withdraw_WhenInviteeAlreadyHasACommittedSeat_RejectsWithoutChangingState", () => {
    // Input
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
    });
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      createTestUser({ userId: "alice" })
        .asParticipant()
        .withdraw(bookingSession, {
          participationId: "p-alice",
          now: hoursBeforeSessionStart(10),
          replacementMode: "DIRECT_INVITE",
          replacementInviteeId: "ben",
        }),
    ).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));
    expect(sessionState(bookingSession)).toEqual(previousState);
  });

  test("withdraw_WhenInviteeAlreadyHasAnotherReservation_RejectsWithoutChangingState", () => {
    // Input
    const firstWithdrawalTime = hoursBeforeSessionStart(10);
    const secondWithdrawalTime = hoursBeforeSessionStart(9);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
    });
    createTestUser({ userId: "alice" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-alice",
        now: firstWithdrawalTime,
        replacementMode: "DIRECT_INVITE",
        replacementInviteeId: "cara",
      });
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      createTestUser({ userId: "ben" })
        .asParticipant()
        .withdraw(bookingSession, {
          participationId: "p-ben",
          now: secondWithdrawalTime,
          replacementMode: "DIRECT_INVITE",
          replacementInviteeId: "cara",
        }),
    ).toThrow(expect.objectContaining({ code: "DUPLICATE_ID" }));
    expect(sessionState(bookingSession)).toEqual(previousState);
  });

  test("withdraw_WhenExactlyAtRefundCutoff_AwaitsReplacement", () => {
    // Input
    const refundCutoff = hoursBeforeSessionStart(30);
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });

    // Log
    const withdrawal = createTestUser({ userId: "alice" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-alice",
        now: refundCutoff,
      });

    // Oracle
    expect(withdrawal.kind).toBe("AWAITING_REPLACEMENT");
    expect(
      bookingSession.participantList.requireParticipation("p-alice").hold
        ?.state,
    ).toBe("AWAITING_REPLACEMENT");
  });

  test("withdraw_WhenOneHourBeforeStart_AwaitsReplacement", () => {
    // Input
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });

    // Log
    const withdrawal = createTestUser({ userId: "alice" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-alice",
        now: hoursBeforeSessionStart(1),
      });

    // Oracle
    expect(withdrawal.kind).toBe("AWAITING_REPLACEMENT");
    expect(
      bookingSession.participantList.requireParticipation("p-alice").hold
        ?.state,
    ).toBe("AWAITING_REPLACEMENT");
  });

  test("withdraw_WhenActorDoesNotOwnParticipation_RejectsWithoutChangingState", () => {
    // Input
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });

    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      createTestUser({ userId: "other" })
        .asParticipant()
        .withdraw(bookingSession, {
          participationId: "p-alice",
          now: hoursBeforeSessionStart(48),
        }),
    ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
    expect(sessionState(bookingSession)).toEqual(previousState);
  });

  test("withdraw_WhenSessionStartsNow_RejectsWithoutChangingState", () => {
    // Input
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });

    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      createTestUser({ userId: "alice" })
        .asParticipant()
        .withdraw(bookingSession, {
          participationId: "p-alice",
          now: sessionStartsAt,
        }),
    ).toThrow(expect.objectContaining({ code: "SESSION_STARTED" }));
    expect(sessionState(bookingSession)).toEqual(previousState);
  });

  test("previewWithdrawal_WhenMoreThan30HoursBeforeStart_ShowsFullRefundWithoutChangingState", () => {
    // Input
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });
    const previousState = sessionState(bookingSession);

    // Log
    const preview = createTestUser({ userId: "alice" })
      .asParticipant()
      .previewWithdrawal(bookingSession, hoursBeforeSessionStart(31));

    // Oracle
    expect(preview.kind).toBe("REFUNDED");
    expect(preview.participationId).toBe("p-alice");
    expect(preview.refundAmount.toCents()).toBe(500);
    expect(preview.heldAmount.toCents()).toBe(500);
    expect(sessionState(bookingSession)).toEqual(previousState);
  });

  test("previewWithdrawal_WhenExactlyAtRefundCutoff_ShowsShareStaysHeld", () => {
    // Input
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });
    const previousState = sessionState(bookingSession);

    // Log
    const preview = createTestUser({ userId: "alice" })
      .asParticipant()
      .previewWithdrawal(bookingSession, hoursBeforeSessionStart(30));

    // Oracle
    expect(preview.kind).toBe("AWAITING_REPLACEMENT");
    expect(preview.refundAmount.toCents()).toBe(0);
    expect(preview.heldAmount.toCents()).toBe(500);
    expect(sessionState(bookingSession)).toEqual(previousState);
  });

  test("previewWithdrawal_WhenFollowedByWithdrawalAtSameTime_MatchesItsOutcome", () => {
    // Input
    const now = hoursBeforeSessionStart(40);
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });
    const alice = createTestUser({ userId: "alice" }).asParticipant();
    const preview = alice.previewWithdrawal(bookingSession, now);

    // Log
    const withdrawal = alice.withdraw(bookingSession, {
      participationId: "p-alice",
      now,
    });

    // Oracle
    expect(withdrawal.kind).toBe(preview.kind);
    expect(
      withdrawal.instructions.map((instruction) =>
        instruction.amount.toCents(),
      ),
    ).toEqual([preview.refundAmount.toCents()]);
  });

  test("previewWithdrawal_WhenUserIsNotParticipating_RejectsWithNotFound", () => {
    // Input
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });

    // Log & Oracle
    expect(() =>
      createTestUser({ userId: "other" })
        .asParticipant()
        .previewWithdrawal(bookingSession, hoursBeforeSessionStart(40)),
    ).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  test("previewWithdrawal_WhenAlreadyWithdrawn_RejectsWithInvalidState", () => {
    // Input
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
    });
    const alice = createTestUser({ userId: "alice" }).asParticipant();
    alice.withdraw(bookingSession, {
      participationId: "p-alice",
      now: hoursBeforeSessionStart(10),
    });

    // Log & Oracle
    expect(() =>
      alice.previewWithdrawal(bookingSession, hoursBeforeSessionStart(9)),
    ).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));
  });

  test("previewWithdrawal_WhenSessionStartsNow_RejectsWithSessionStarted", () => {
    // Input
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });

    // Log & Oracle
    expect(() =>
      createTestUser({ userId: "alice" })
        .asParticipant()
        .previewWithdrawal(bookingSession, sessionStartsAt),
    ).toThrow(expect.objectContaining({ code: "SESSION_STARTED" }));
  });
});
