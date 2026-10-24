import { Participation } from "@/domain";
import { describe, expect, test } from "vitest";
import {
  hoursBeforeSessionStart,
  committedParticipation,
  createTestSession,
  sessionStartsAt,
} from "./session-fixtures";

describe("Session admission and availability", () => {
  test("recordAdmission_WhenBookerTakesEighthSlot_FillsSession", () => {
    const bookerJoinedAt = hoursBeforeSessionStart(48);
    const bookingSession = createTestSession({
      totalSlots: 8,
      committedUserIds: [
        "alice",
        "ben",
        "cara",
        "dana",
        "evan",
        "farah",
        "grace",
      ],
    });
    const bookerAdmission = committedParticipation(bookingSession, "booker");

    bookingSession.recordAdmission(
      bookerAdmission,
      undefined,
      bookerJoinedAt,
    );

    const participantList = bookingSession.participantList;

    expect(participantList.findByUserId("booker")).toBe(bookerAdmission);
    expect(
      participantList.participations.map((entry) => entry.status),
    ).toEqual([
      "COMMITTED",
      "COMMITTED",
      "COMMITTED",
      "COMMITTED",
      "COMMITTED",
      "COMMITTED",
      "COMMITTED",
      "COMMITTED",
    ]);
    expect(bookingSession.getAvailableSlots(bookerJoinedAt)).toBe(0);
  });

  test("recordAdmission_WhenSessionIsFull_RecordsWaitlistedParticipation", () => {
    const waitlistedAt = hoursBeforeSessionStart(48);
    const bookingSession = createTestSession({
      totalSlots: 8,
      committedUserIds: [
        "booker",
        "alice",
        "ben",
        "cara",
        "dana",
        "evan",
        "farah",
        "grace",
      ],
    });
    const waiting = Participation.createWaitlisted({
      participationId: "p-waiting",
      userId: "waiting",
      waitlistedAt,
      queueSequence: 1,
    });

    bookingSession.recordAdmission(waiting, undefined, waitlistedAt);
    const participantList = bookingSession.participantList;

    expect(participantList.requireParticipation("p-waiting")).toBe(waiting);
    expect(participantList.nextWaitlisted()).toBe(waiting);
    expect(participantList.committedCount).toBe(8);
    expect(participantList.nextQueueSequence).toBe(2);
    expect(bookingSession.getAvailableSlots(waitlistedAt)).toBe(0);
  });

  test("getAvailableSlots_WhenSessionStartsNow_ReturnsZero", () => {
    const bookingSession = createTestSession();

    const availableSlots = bookingSession.getAvailableSlots(sessionStartsAt);

    expect(availableSlots).toBe(0);
  });
});
