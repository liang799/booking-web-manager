import { describe, expect, test } from "vitest";
import { Session } from "@/domain";
import {
  createTestSession,
  hoursBeforeSessionStart,
  readyBooker,
  sessionDetails,
} from "../../sessions/session/session-fixtures";

describe("Booker", () => {
  test("cancel_WhenRosterHasRemovedParticipant_PreservesRemovalWithoutSecondRefund", () => {
    // Input
    const session = createTestSession({
      committedUserIds: ["alice", "ben"],
      waitlistedUserIds: ["cara"],
    });
    const booker = readyBooker();
    booker.removeParticipant(session, "p-alice", hoursBeforeSessionStart(48));
    const removed = session.participantList.requireParticipation("p-alice");

    // Log
    const cancellation = booker.cancel(session, hoursBeforeSessionStart(24));
    const restoredSession = new Session(
      sessionDetails({
        status: "CANCELLED",
        participations: session.participantList.participations,
        nextQueueSequence: session.participantList.nextQueueSequence,
      }),
    );

    // Oracle
    expect(session.status).toBe("CANCELLED");
    expect(session.participantList.requireParticipation("p-alice")).toBe(
      removed,
    );
    expect(
      cancellation.instructions.map((instruction) => [
        instruction.participationId,
        instruction.amount.toCents(),
      ]),
    ).toEqual([["p-ben", 500]]);
    expect(session.participantList.requireParticipation("p-cara").status).toBe(
      "CANCELLED",
    );
    expect(
      restoredSession.participantList.requireParticipation("p-alice").status,
    ).toBe("REMOVED");
  });

  test("cancel_WhenRosterHasPreviouslyCancelledParticipant_PreservesTerminalHold", () => {
    // Input
    const original = createTestSession({ committedUserIds: ["alice"] });
    readyBooker().cancel(original, hoursBeforeSessionStart(48));
    const closed = original.participantList.requireParticipation("p-alice");
    const session = new Session(sessionDetails({ participations: [closed] }));

    // Log
    const cancellation = readyBooker().cancel(
      session,
      hoursBeforeSessionStart(24),
    );

    // Oracle
    expect(session.participantList.requireParticipation("p-alice")).toBe(
      closed,
    );
    expect(cancellation.instructions).toEqual([]);
  });
});
