import { describe, expect, test } from "vitest";
import {
  hoursBeforeSessionStart,
  createTestUser,
  createTestSession,
  sessionState,
} from "../../sessions/session/session-fixtures";

describe("Participant", () => {
  test("leaveWaitlist_WhenEmailIsMissing_StillLeavesAnExistingEntry", () => {
    const bookingSession = createTestSession({ waitlistedUserIds: ["alice"] });
    const alice = createTestUser({
      userId: "alice",
      email: null,
      emailVerified: false,
    }).asParticipant();

    alice.leaveWaitlist(bookingSession, {
      participationId: "p-alice",
      now: hoursBeforeSessionStart(48),
    });

    expect(
      bookingSession.participantList.requireParticipation("p-alice").status,
    ).toBe("LEFT_WAITLIST");
    expect(bookingSession.participantList.nextWaitlisted()).toBeUndefined();
  });

  test("join_WhenOnlyAvailableSeatIsReserved_JoinsOrdinaryWaitlistWithoutTakingReservation", () => {
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

    const admission = createTestUser({ userId: "dana" })
      .asParticipant()
      .join(bookingSession, {
        participationId: "p-dana",
        holdId: "h-dana",
        now: joinTime,
      });

    expect(admission).toEqual({
      kind: "WAITLISTED",
      participationId: "p-dana",
      instructions: [],
    });
    expect(bookingSession.participantList.nextWaitlisted()?.userId).toBe(
      "dana",
    );
    expect(
      bookingSession.participantList.requireParticipation("p-ben").hold?.state,
    ).toBe("AWAITING_REPLACEMENT");
    expect(bookingSession.participantList.committedCount).toBe(1);
    expect(bookingSession.getAvailableSlots(joinTime)).toBe(0);
  });

  test("leaveWaitlist_WhenParticipantOwnsWaitingEntry_LeavesWithoutChangingCommitments", () => {
    const waitlistDepartureTime = hoursBeforeSessionStart(48);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
      waitlistedUserIds: ["waiting"],
    });
    const participant = createTestUser({ userId: "waiting" }).asParticipant();

    participant.leaveWaitlist(bookingSession, {
      participationId: "p-waiting",
      now: waitlistDepartureTime,
    });
    const participationStatuses =
      bookingSession.participantList.participations.map(
        (entry) => entry.status,
      );

    expect(participationStatuses).toEqual([
      "COMMITTED",
      "COMMITTED",
      "LEFT_WAITLIST",
    ]);
    expect(
      bookingSession.participantList.nextWaitlisted()?.userId,
    ).toBeUndefined();
    expect(bookingSession.getAvailableSlots(waitlistDepartureTime)).toBe(0);
  });

  test("leaveWaitlist_WhenEntryBelongsToAnotherParticipant_RejectsWithoutChangingState", () => {
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
      waitlistedUserIds: ["waiting"],
    });
    const participant = createTestUser({ userId: "other" }).asParticipant();
    const previousState = sessionState(bookingSession);

    expect(() =>
      participant.leaveWaitlist(bookingSession, {
        participationId: "p-waiting",
        now: hoursBeforeSessionStart(48),
      }),
    ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));

    expect(sessionState(bookingSession)).toEqual(previousState);
  });

  test("leaveWaitlist_WhenParticipantIsCommitted_RejectsWithoutChangingState", () => {
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });

    const alice = createTestUser({ userId: "alice" }).asParticipant();
    const previousState = sessionState(bookingSession);

    expect(() =>
      alice.leaveWaitlist(bookingSession, {
        participationId: "p-alice",
        now: hoursBeforeSessionStart(48),
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));

    expect(sessionState(bookingSession)).toEqual(previousState);
  });
});
