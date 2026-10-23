import { Participation } from "@/domain";
import { describe, expect, test } from "vitest";
import {
  hoursBeforeSessionStart,
  committedParticipation,
  createTestSession,
  sessionStartsAt,
} from "./session-fixtures";

describe("Session", () => {
  describe("Capacity", () => {
    test("recordAdmission_WhenBookerTakesEighthSlot_FillsSession", () => {
      // Input
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

      // Log
      const participantList = bookingSession.participantList;
      const availableSlots = bookingSession.getAvailableSlots(bookerJoinedAt);

      // Oracle
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
      expect(availableSlots).toBe(0);
    });

    test("recordAdmission_WhenSessionIsFull_RecordsWaitlistedParticipation", () => {
      // Input
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

      // Log
      const participantList = bookingSession.participantList;
      const availableSlots = bookingSession.getAvailableSlots(waitlistedAt);

      // Oracle
      expect(participantList.requireParticipation("p-waiting")).toBe(waiting);
      expect(participantList.nextWaitlisted()).toBe(waiting);
      expect(participantList.committedCount).toBe(8);
      expect(participantList.nextQueueSequence).toBe(2);
      expect(availableSlots).toBe(0);
    });
  });

  describe("Availability", () => {
    test("getAvailableSlots_WhenSessionStartsNow_ReturnsZero", () => {
      // Input
      const bookingSession = createTestSession();

      // Log
      const availableSlots = bookingSession.getAvailableSlots(sessionStartsAt);

      // Oracle
      expect(availableSlots).toBe(0);
    });
  });
});
