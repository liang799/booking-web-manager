import { Participation } from "@/domain";
import { describe, expect, test } from "vitest";
import {
  hoursBeforeSessionStart,
  committedParticipation,
  createTestSession,
  sessionStartsAt,
} from "./session-fixtures";

describe("Session admission and availability", () => {
  test("recordAdmission_WhenLastGuestTakesTheRemainingPlace_FillsSession", () => {
    const guestJoinedAt = hoursBeforeSessionStart(48);
    const bookingSession = createTestSession({
      totalSlots: 9,
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
    const guestAdmission = committedParticipation(bookingSession, "harry");

    bookingSession.recordAdmission(
      guestAdmission,
      undefined,
      guestJoinedAt,
    );

    const participantList = bookingSession.participantList;

    expect(participantList.findByUserId("harry")).toBe(guestAdmission);
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
    expect(bookingSession.getAvailableSlots(guestJoinedAt)).toBe(0);
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
