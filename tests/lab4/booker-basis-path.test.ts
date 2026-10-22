import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { Session } from "@/domain";
import {
  createTestSession, createTestUser, hoursBeforeSessionStart,
  readyBooker, sessionDetails,
} from "../domain/sessions/session/session-fixtures";

const observations: object[] = [];
const now = hoursBeforeSessionStart(24);

describe("Booker", () => {
  test("cancel_WhenB1RemovedParticipation_PreservesHistoryWithoutAnotherRefund", () => {
    // Arrange
    const session = createTestSession({ committedUserIds: ["alice"] });
    const booker = readyBooker();
    booker.removeParticipant(session, "p-alice", hoursBeforeSessionStart(48));
    const removed = session.participantList.requireParticipation("p-alice");

    // Act
    const result = booker.cancel(session, now);

    // Assert
    expect(session.participantList.requireParticipation("p-alice")).toBe(removed);
    observe("WB-B1", "REMOVED with REFUNDED hold", "B0 B1 B5 B8",
      { session: "CANCELLED", participation: "REMOVED", hold: "REFUNDED", instructionCents: [] },
      { session: session.status, participation: removed.status, hold: removed.hold?.state,
        instructionCents: result.instructions.map((i) => i.amount.toCents()) });
  });

  test("cancel_WhenB2PreviouslyCancelledParticipation_PreservesTerminalRecord", () => {
    // Arrange
    const original = createTestSession({ committedUserIds: ["alice"] });
    readyBooker().cancel(original, hoursBeforeSessionStart(48));
    const cancelled = original.participantList.requireParticipation("p-alice");
    const session = new Session(sessionDetails({ participations: [cancelled] }));

    // Act
    const result = readyBooker().cancel(session, now);

    // Assert
    expect(session.participantList.requireParticipation("p-alice")).toBe(cancelled);
    observe("WB-B2", "CANCELLED with REFUNDED hold", "B0 B1 B2 B5 B8",
      { session: "CANCELLED", participation: "CANCELLED", hold: "REFUNDED", instructionCents: [] },
      { session: session.status, participation: cancelled.status, hold: cancelled.hold?.state,
        instructionCents: result.instructions.map((i) => i.amount.toCents()) });
  });

  test("cancel_WhenB3WaitlistedParticipationWithoutHold_CancelsWithoutRefund", () => {
    // Arrange
    const session = createTestSession({ waitlistedUserIds: ["alice"] });

    // Act
    const result = readyBooker().cancel(session, now);

    // Assert
    const participation = session.participantList.requireParticipation("p-alice");
    observe("WB-B3", "WAITLISTED without hold", "B0 B1 B2 B3 B7 B8",
      { session: "CANCELLED", participation: "CANCELLED", hold: null, instructionCents: [] },
      { session: session.status, participation: participation.status, hold: participation.hold?.state ?? null,
        instructionCents: result.instructions.map((i) => i.amount.toCents()) });
  });

  test("cancel_WhenB4WithdrawnParticipationAlreadyRefunded_DoesNotRefundTwice", () => {
    // Arrange
    const session = createTestSession({ committedUserIds: ["alice"] });
    createTestUser({ userId: "alice" }).asParticipant().withdraw(session, {
      participationId: "p-alice", now: hoursBeforeSessionStart(48),
    });

    // Act
    const result = readyBooker().cancel(session, now);

    // Assert
    const participation = session.participantList.requireParticipation("p-alice");
    observe("WB-B4", "WITHDRAWN with REFUNDED hold", "B0 B1 B2 B3 B4 B7 B8",
      { session: "CANCELLED", participation: "CANCELLED", hold: "REFUNDED", instructionCents: [] },
      { session: session.status, participation: participation.status, hold: participation.hold?.state,
        instructionCents: result.instructions.map((i) => i.amount.toCents()) });
  });

  test("cancel_WhenB5CommittedParticipationStillHeld_RefundsExactlyOnce", () => {
    // Arrange
    const session = createTestSession({ committedUserIds: ["alice"] });

    // Act
    const result = readyBooker().cancel(session, now);

    // Assert
    const participation = session.participantList.requireParticipation("p-alice");
    expect(result.instructions[0]?.kind).toBe("REFUND");
    observe("WB-B5", "COMMITTED with HELD 500 cents", "B0 B1 B2 B3 B4 B6 B8",
      { session: "CANCELLED", participation: "CANCELLED", hold: "REFUNDED", instructionCents: [500] },
      { session: session.status, participation: participation.status, hold: participation.hold?.state,
        instructionCents: result.instructions.map((i) => i.amount.toCents()) });
  });
});

function observe(id: string, input: string, predictedPath: string, expected: object, actual: object) {
  observations.push({ id, input, predictedPath, expected, actual });
  expect(actual).toEqual(expected);
}

afterAll(() => {
  if (!process.env.LAB4_EVIDENCE_DIR) return;
  const directory = path.resolve(process.env.LAB4_EVIDENCE_DIR);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "testing-booker-observations.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), observations }, null, 2) + "\n");
});
