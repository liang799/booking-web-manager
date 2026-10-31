import { describe, expect, test } from "vitest";
import { Session } from "@/domain";
import {
  createTestSession,
  hoursBeforeSessionStart,
  cancelledParticipation,
  removedParticipation,
  readyBooker,
  sessionDetails,
} from "../../sessions/session/session-fixtures";

describe("Booker cancellation preserves prior refunds", () => {
  test("cancel_WhenRosterHasRemovedParticipant_PreservesRemovalWithoutSecondRefund", () => {
    const session = createTestSession({
      committedUserIds: ["alice", "ben"],
      waitlistedUserIds: ["cara"],
      participationOverrides: {
        alice: removedParticipation("alice", {
          settledAt: hoursBeforeSessionStart(48),
        }),
      },
    });
    const booker = readyBooker();
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
    const closed = cancelledParticipation("alice", {
      settledAt: hoursBeforeSessionStart(48),
    });
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
