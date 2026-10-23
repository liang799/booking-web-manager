import { describe, expect, test } from "vitest";
import {
  hoursBeforeSessionStart,
  createTestUser,
  createTestSession,
  sessionState,
} from "../../sessions/session/session-fixtures";

describe("Participant", () => {
  test("leaveWaitlist_WhenEmailIsMissing_StillLeavesAnExistingEntry", () => {
    // Input
    const bookingSession = createTestSession({ waitlistedUserIds: ["alice"] });
    const alice = createTestUser({
      userId: "alice",
      email: null,
      emailVerified: false,
    }).asParticipant();

    // Log
    alice.leaveWaitlist(bookingSession, {
      participationId: "p-alice",
      now: hoursBeforeSessionStart(48),
    });
    const aliceStatus =
      bookingSession.participantList.requireParticipation("p-alice").status;
    const nextWaiter = bookingSession.participantList.nextWaitlisted();

    // Oracle
    expect(aliceStatus).toBe("LEFT_WAITLIST");
    expect(nextWaiter).toBeUndefined();
  });

  test("join_WhenOnlyAvailableSeatIsReserved_JoinsOrdinaryWaitlistWithoutTakingReservation", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(10);
    const joinTime = hoursBeforeSessionStart(9);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
    });
    createTestUser({ userId: "ben" }).asParticipant().withdraw(bookingSession, {
      participationId: "p-ben",
      now: withdrawalTime,
      replacementMode: "DIRECT_INVITE",
      replacementInviteeId: "cara",
    });

    // Log
    const admission = createTestUser({ userId: "dana" })
      .asParticipant()
      .join(bookingSession, {
        participationId: "p-dana",
        holdId: "h-dana",
        now: joinTime,
      });
    const nextWaiter = bookingSession.participantList.nextWaitlisted();
    const benParticipation =
      bookingSession.participantList.requireParticipation("p-ben");
    const committedCount = bookingSession.participantList.committedCount;
    const availableSlots = bookingSession.getAvailableSlots(joinTime);

    // Oracle
    expect(admission).toEqual({
      kind: "WAITLISTED",
      participationId: "p-dana",
      instructions: [],
    });
    expect(nextWaiter?.userId).toBe("dana");
    expect(benParticipation.hold?.state).toBe("AWAITING_REPLACEMENT");
    expect(committedCount).toBe(1);
    expect(availableSlots).toBe(0);
  });

  test("leaveWaitlist_WhenParticipantOwnsWaitingEntry_LeavesWithoutChangingCommitments", () => {
    // Input
    const waitlistDepartureTime = hoursBeforeSessionStart(48);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
      waitlistedUserIds: ["waiting"],
    });
    const participant = createTestUser({ userId: "waiting" }).asParticipant();

    // Log
    participant.leaveWaitlist(bookingSession, {
      participationId: "p-waiting",
      now: waitlistDepartureTime,
    });
    const participationStatuses = bookingSession.participantList.participations.map(
      (entry) => entry.status,
    );
    const nextWaiterId = bookingSession.participantList.nextWaitlisted()?.userId;
    const availableSlots = bookingSession.getAvailableSlots(waitlistDepartureTime);

    // Oracle
    expect(participationStatuses).toEqual(["COMMITTED", "COMMITTED", "LEFT_WAITLIST"]);
    expect(nextWaiterId).toBeUndefined();
    expect(availableSlots).toBe(0);
  });

  test("leaveWaitlist_WhenEntryBelongsToAnotherParticipant_RejectsWithoutChangingState", () => {
    // Input
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
      waitlistedUserIds: ["waiting"],
    });
    const participant = createTestUser({ userId: "other" }).asParticipant();
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      participant.leaveWaitlist(bookingSession, {
        participationId: "p-waiting",
        now: hoursBeforeSessionStart(48),
      }),
    ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));

    // Log
    const currentState = sessionState(bookingSession);

    // Oracle
    expect(currentState).toEqual(previousState);
  });

  test("leaveWaitlist_WhenParticipantIsCommitted_RejectsWithoutChangingState", () => {
    // Input
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });

    const alice = createTestUser({ userId: "alice" }).asParticipant();
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      alice.leaveWaitlist(bookingSession, {
        participationId: "p-alice",
        now: hoursBeforeSessionStart(48),
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));

    // Log
    const currentState = sessionState(bookingSession);

    // Oracle
    expect(currentState).toEqual(previousState);
  });
});
