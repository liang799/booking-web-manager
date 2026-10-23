import { Session } from "@/domain";
import { describe, expect, test } from "vitest";
import {
  hoursAfterSessionEnd,
  createTestSession,
  sessionDetails,
  sessionState,
  verifiedParticipation,
} from "./session-fixtures";

describe("Session", () => {
  test("autoVerifyAttendance_WhenOneMillisecondBeforeDue_RejectsWithoutChangingState", () => {
    // Input
    const automaticVerificationDueAt = hoursAfterSessionEnd(72);
    const oneMillisecondBeforeAutomaticVerification = new Date(
      automaticVerificationDueAt.getTime() - 1,
    );
    const unverifiedSession = createTestSession({ committedUserIds: ["ben"] });
    const bookingSession = new Session(
      sessionDetails({
        participations: [
          verifiedParticipation("alice", "ABSENT"),
          ...unverifiedSession.participantList.participations,
        ],
      }),
    );
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      bookingSession.autoVerifyAttendance(
        oneMillisecondBeforeAutomaticVerification,
      ),
    ).toThrow(expect.objectContaining({ code: "AUTO_VERIFICATION_NOT_DUE" }));
    expect(sessionState(bookingSession)).toEqual(previousState);
  });

  test("autoVerifyAttendance_WhenExactlySeventyTwoHoursAfterEnd_VerifiesOnlyRemainingParticipants", () => {
    // Input
    const automaticVerificationDueAt = hoursAfterSessionEnd(72);
    const unverifiedSession = createTestSession({ committedUserIds: ["ben"] });
    const bookingSession = new Session(
      sessionDetails({
        participations: [
          verifiedParticipation("alice", "ABSENT"),
          ...unverifiedSession.participantList.participations,
        ],
      }),
    );

    // Log
    bookingSession.autoVerifyAttendance(automaticVerificationDueAt);
    const attendanceRecords = bookingSession.participantList.participations.map(
      (participation) => [
        participation.attendance,
        participation.verificationMethod,
      ],
    );

    // Oracle
    expect(attendanceRecords).toEqual([
      ["ABSENT", "BOOKER"],
      ["ATTENDED", "AUTOMATIC"],
    ]);
  });
});
