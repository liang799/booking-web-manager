import { describe, expect, test } from "vitest";
import {
  hoursBeforeSessionEnd,
  createTestUser,
  sessionEndsAt,
  readyBooker,
  createTestSession,
  sessionState,
} from "../../sessions/session/session-fixtures";

describe("Booker", () => {
  test("verifyAttendance_WhenOwnerIsInactive_StillFinalizesAttendance", () => {
    // Input
    const attendanceVerificationTime = sessionEndsAt;
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });
    const booker = createTestUser({
      userId: "booker",
      accountStatus: "INACTIVE",
    }).asBooker();

    // Log
    booker.verifyAttendance(bookingSession, {
      marks: [{ participationId: "p-alice", attendance: "ATTENDED" }],
      now: attendanceVerificationTime,
    });
    const aliceAttendance =
      bookingSession.participantList.requireParticipation("p-alice").attendance;
    const sessionStatus = bookingSession.status;

    // Oracle
    expect(aliceAttendance).toBe("ATTENDED");
    expect(sessionStatus).toBe("AWAITING_PAYOUT");
  });

  test("verifyAttendance_WhenSessionHasNotEnded_RejectsWithoutChangingState", () => {
    // Input
    const attendanceVerificationTime = hoursBeforeSessionEnd(1);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
    });

    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      readyBooker().verifyAttendance(bookingSession, {
        marks: [{ participationId: "p-alice", attendance: "ATTENDED" }],
        now: attendanceVerificationTime,
      }),
    ).toThrow(expect.objectContaining({ code: "SESSION_NOT_ENDED" }));

    expect(sessionState(bookingSession)).toEqual(previousState);
  });

  test("verifyAttendance_WhenLaterMarkConflicts_RejectsWithoutChangingState", () => {
    // Input
    const attendanceVerificationTime = sessionEndsAt;
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
      readyBooker().verifyAttendance(bookingSession, {
        marks: [
          { participationId: "p-ben", attendance: "ATTENDED" },
          { participationId: "p-alice", attendance: "ABSENT" },
        ],
        now: attendanceVerificationTime,
      }),
    ).toThrow(expect.objectContaining({ code: "ATTENDANCE_CONFLICT" }));

    expect(sessionState(bookingSession)).toEqual(previousState);
  });

  test("verifyAttendance_WhenFinalParticipantIsMarked_AwaitsPayout", () => {
    // Input
    const attendanceVerificationTime = sessionEndsAt;
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
    });
    readyBooker().verifyAttendance(bookingSession, {
      marks: [{ participationId: "p-alice", attendance: "ATTENDED" }],
      now: attendanceVerificationTime,
    });

    // Log
    readyBooker().verifyAttendance(bookingSession, {
      marks: [{ participationId: "p-ben", attendance: "ABSENT" }],
      now: attendanceVerificationTime,
    });
    const sessionStatus = bookingSession.status;

    // Oracle
    expect(sessionStatus).toBe("AWAITING_PAYOUT");
  });
});
