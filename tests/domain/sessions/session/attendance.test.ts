import { describe, expect, test } from "vitest";
import {
  hoursAfterSessionEnd,
  createTestSession,
  sessionState,
} from "./session-fixtures";

describe("Session", () => {
  test("autoVerifyAttendance_WhenOneMillisecondBeforeDue_RejectsWithoutChangingState", () => {
    const automaticVerificationDueAt = hoursAfterSessionEnd(72);
    const oneMillisecondBeforeAutomaticVerification = new Date(
      automaticVerificationDueAt.getTime() - 1,
    );
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
      attendanceByUserId: { alice: "ABSENT" },
    });
    const previousState = sessionState(bookingSession);

    expect(() =>
      bookingSession.autoVerifyAttendance(
        oneMillisecondBeforeAutomaticVerification,
      ),
    ).toThrow(expect.objectContaining({ code: "AUTO_VERIFICATION_NOT_DUE" }));
    expect(sessionState(bookingSession)).toEqual(previousState);
  });

  test("autoVerifyAttendance_WhenExactlySeventyTwoHoursAfterEnd_VerifiesOnlyRemainingParticipants", () => {
    const automaticVerificationDueAt = hoursAfterSessionEnd(72);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
      attendanceByUserId: { alice: "ABSENT" },
    });

    bookingSession.autoVerifyAttendance(automaticVerificationDueAt);
    const attendanceRecords = bookingSession.participantList.participations.map(
      (participation) => [
        participation.attendance,
        participation.verificationMethod,
      ],
    );

    expect(attendanceRecords).toEqual([
      ["ABSENT", "BOOKER"],
      ["ATTENDED", "AUTOMATIC"],
    ]);
  });
});
