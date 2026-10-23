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
    const sessionStatus = session.status;
    const aliceParticipation =
      session.participantList.requireParticipation("p-alice");
    const caraParticipation =
      session.participantList.requireParticipation("p-cara");

    // Oracle
    expect(sessionStatus).toBe("CANCELLED");
    expect(aliceParticipation).toBe(removed);
    expect(
      cancellation.instructions.map((instruction) => [
        instruction.participationId,
        instruction.amount.toCents(),
      ]),
    ).toEqual([["p-ben", 500]]);
    expect(caraParticipation.status).toBe("CANCELLED");
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
    const aliceParticipation =
      session.participantList.requireParticipation("p-alice");

    // Oracle
    expect(aliceParticipation).toBe(closed);
    expect(cancellation.instructions).toEqual([]);
  });
});
