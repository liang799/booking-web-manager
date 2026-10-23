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
    const session = createTestSession({
      committedUserIds: ["alice", "ben"],
      waitlistedUserIds: ["cara"],
    });
    const booker = readyBooker();
    booker.removeParticipant(session, "p-alice", hoursBeforeSessionStart(48));
    const removed = session.participantList.requireParticipation("p-alice");

    const cancellation = booker.cancel(session, hoursBeforeSessionStart(24));

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
  });

  test("cancel_WhenRosterHasPreviouslyCancelledParticipant_PreservesTerminalHold", () => {
    const original = createTestSession({ committedUserIds: ["alice"] });
    readyBooker().cancel(original, hoursBeforeSessionStart(48));
    const closed = original.participantList.requireParticipation("p-alice");
    const session = new Session(sessionDetails({ participations: [closed] }));

    const cancellation = readyBooker().cancel(
      session,
      hoursBeforeSessionStart(24),
    );

    expect(session.participantList.requireParticipation("p-alice")).toBe(
      closed,
    );
    expect(cancellation.instructions).toEqual([]);
  });
});
