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

      // Log
      bookingSession.recordAdmission(
        bookerAdmission,
        undefined,
        bookerJoinedAt,
      );

      const participantList = bookingSession.participantList;
      const availableSlots = bookingSession.getAvailableSlots(bookerJoinedAt);

      const recordedBooker = participantList.findByUserId("booker");

      // Oracle
      expect(recordedBooker).toBe(bookerAdmission);
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

      // Log
      bookingSession.recordAdmission(waiting, undefined, waitlistedAt);
      const participantList = bookingSession.participantList;
      const availableSlots = bookingSession.getAvailableSlots(waitlistedAt);

      const recordedWaiter = participantList.requireParticipation("p-waiting");
      const nextWaiter = participantList.nextWaitlisted();

      // Oracle
      expect(recordedWaiter).toBe(waiting);
      expect(nextWaiter).toBe(waiting);
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
