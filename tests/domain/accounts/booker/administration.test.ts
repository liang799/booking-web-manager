import { DomainError, Session } from "@/domain";
import { describe, expect, test, vi } from "vitest";
import {
  hoursBeforeSessionStart,
  createTestUser,
  readyBooker,
  createTestSession,
  sessionDetails,
  sessionState,
  sessionStartsAt,
} from "../../sessions/session/session-fixtures";

describe("Booker", () => {
  test("cancel_WhenOwnerCancelsEmptySession_ReturnsNoInstructions", () => {
    // Input
    const cancellationTime = hoursBeforeSessionStart(48);
    const booker = readyBooker();
    const session = createTestSession();

    // Log
    const cancellation = booker.cancel(session, cancellationTime);
    const bookerId = session.bookerId;
    const sessionStatus = session.status;

    // Oracle
    expect(bookerId).toBe(booker.userId);
    expect(sessionStatus).toBe("CANCELLED");
    expect(cancellation.instructions).toEqual([]);
  });

  test("assertCanCancel_WhenOwnerIsUnverified_AllowsExitWithoutChangingSession", () => {
    // Input
    const cancellationTime = hoursBeforeSessionStart(48);
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });
    const booker = createTestUser({
      userId: "booker",
      emailVerified: false,
    }).asBooker();
    const previousState = sessionState(bookingSession);

    // Log
    booker.assertCanCancel(bookingSession, cancellationTime);
    const currentState = sessionState(bookingSession);

    // Oracle
    expect(currentState).toEqual(previousState);
  });

  test("assertCanCancel_WhenSessionHasStarted_ReportsCommandLifecycleFailure", () => {
    // Input
    const bookingSession = createTestSession();
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      readyBooker().assertCanCancel(bookingSession, sessionStartsAt),
    ).toThrow(expect.objectContaining({ code: "SESSION_STARTED" }));

    expect(sessionState(bookingSession)).toEqual(previousState);
  });

  test("assertCanChangeVisibility_WhenOwnerIsUnverified_DoesNotChangeVisibility", () => {
    // Input
    const bookingSession = createTestSession();
    const booker = createTestUser({
      userId: "booker",
      emailVerified: false,
    }).asBooker();
    const previousState = sessionState(bookingSession);

    // Log
    booker.assertCanChangeVisibility(
      bookingSession,
      "PRIVATE",
      hoursBeforeSessionStart(48),
    );
    const currentState = sessionState(bookingSession);

    // Oracle
    expect(currentState).toEqual(previousState);
  });

  test("assertCanChangeVisibility_WhenSessionIsFull_ReportsCommandCapacityFailure", () => {
    // Input
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
    });
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      readyBooker().assertCanChangeVisibility(
        bookingSession,
        "PRIVATE",
        hoursBeforeSessionStart(48),
      ),
    ).toThrow(expect.objectContaining({ code: "CAPACITY_EXCEEDED" }));

    expect(sessionState(bookingSession)).toEqual(previousState);
  });

  test("cancel_WhenSecondChildFails_PreservesParticipantsHoldsAndStatus", () => {
    // Input
    const cancellationTime = hoursBeforeSessionStart(48);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
      waitlistedUserIds: ["waiting"],
    });
    const booker = readyBooker();
    const previousState = sessionState(bookingSession);

    // Simulate Ben's cancellation failing after Alice has been processed.
    const cancelBen = vi
      .spyOn(
        bookingSession.participantList.requireParticipation("p-ben"),
        "cancel",
      )
      .mockImplementationOnce(() => {
        throw new DomainError("INVALID_STATE", "Second cancellation failed");
      });

    try {
      // Log & Oracle
      expect(() => booker.cancel(bookingSession, cancellationTime)).toThrow(
        new DomainError("INVALID_STATE", "Second cancellation failed"),
      );

      expect(cancelBen).toHaveBeenCalledOnce();
      expect(sessionState(bookingSession)).toEqual(previousState);
    } finally {
      cancelBen.mockRestore();
    }
  });

  test("cancel_WhenPreviousChildFailureWasResolved_CancelsAndRefunds", () => {
    // Input
    const cancellationTime = hoursBeforeSessionStart(48);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
      waitlistedUserIds: ["waiting"],
    });
    const booker = readyBooker();

    // Simulate a failed first cancellation before exercising the retry.
    const cancelBen = vi
      .spyOn(
        bookingSession.participantList.requireParticipation("p-ben"),
        "cancel",
      )
      .mockImplementationOnce(() => {
        throw new DomainError("INVALID_STATE", "Second cancellation failed");
      });

    // Establish a rejected cancellation before exercising the retry.
    try {
      expect(() => booker.cancel(bookingSession, cancellationTime)).toThrow(
        new DomainError("INVALID_STATE", "Second cancellation failed"),
      );
    } finally {
      cancelBen.mockRestore();
    }

    // Log
    const cancellation = booker.cancel(bookingSession, cancellationTime);
    const sessionStatus = bookingSession.status;
    const participations = bookingSession.participantList.participations;

    // Oracle
    expect(
      cancellation.instructions.map((instruction) => instruction.kind),
    ).toEqual(["REFUND", "REFUND"]);
    expect(sessionStatus).toBe("CANCELLED");
    expect(participations.map((participation) => participation.status)).toEqual(
      ["CANCELLED", "CANCELLED", "CANCELLED"],
    );
  });

  test("cancel_WhenOwnerIsInactive_StillCancelsAndRefunds", () => {
    // Input
    const cancellationTime = hoursBeforeSessionStart(48);
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });
    const booker = createTestUser({
      userId: "booker",
      accountStatus: "INACTIVE",
    }).asBooker();

    // Log
    const cancellation = booker.cancel(bookingSession, cancellationTime);
    const sessionStatus = bookingSession.status;

    // Oracle
    expect(sessionStatus).toBe("CANCELLED");
    expect(cancellation.instructions[0]?.kind).toBe("REFUND");
  });

  test("changeVisibility_WhenOwnerIsUnverified_ChangesPublicSessionToPrivate", () => {
    // Input
    const visibilityChangeTime = hoursBeforeSessionStart(48);
    const bookingSession = new Session(sessionDetails({ visibility: "PUBLIC" }));
    const booker = createTestUser({
      userId: "booker",
      emailVerified: false,
    }).asBooker();

    // Log change result
    booker.changeVisibility(bookingSession, "PRIVATE", visibilityChangeTime);
    const visibility = bookingSession.visibility;

    // Oracle
    expect(visibility).toBe("PRIVATE");
  });

  test("changeVisibility_WhenOwnerIsInactive_StillChangesVisibility", () => {
    // Input
    const visibilityChangeTime = hoursBeforeSessionStart(48);
    const bookingSession = createTestSession();
    const booker = createTestUser({
      userId: "booker",
      accountStatus: "INACTIVE",
    }).asBooker();

    // Log change result
    booker.changeVisibility(bookingSession, "PRIVATE", visibilityChangeTime);
    const visibility = bookingSession.visibility;

    // Oracle
    expect(visibility).toBe("PRIVATE");
  });

  test("changeVisibility_WhenSessionIsFull_RejectsWithoutChangingState", () => {
    // Input
    const visibilityChangeTime = hoursBeforeSessionStart(48);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
    });
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      readyBooker().changeVisibility(
        bookingSession,
        "PRIVATE",
        visibilityChangeTime,
      ),
    ).toThrow(expect.objectContaining({ code: "CAPACITY_EXCEEDED" }));

    expect(sessionState(bookingSession)).toEqual(previousState);
  });

  test("removeParticipant_WhenOwnerIsInactive_StillRemovesAndRefunds", () => {
    // Input
    const removalTime = hoursBeforeSessionStart(48);
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });
    const booker = createTestUser({
      userId: "booker",
      accountStatus: "INACTIVE",
    }).asBooker();

    // Log
    const removal = booker.removeParticipant(
      bookingSession,
      "p-alice",
      removalTime,
    );
    const aliceParticipation =
      bookingSession.participantList.requireParticipation("p-alice");

    // Oracle
    expect(aliceParticipation.status).toBe("REMOVED");
    expect(aliceParticipation.hold?.state).toBe("REFUNDED");
    expect(removal.instructions[0]?.kind).toBe("REFUND");
  });

  test("removeParticipant_WhenActorIsNotBooker_RejectsWithoutChangingState", () => {
    // Input
    const removalTime = hoursBeforeSessionStart(48);
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      readyBooker("other").removeParticipant(
        bookingSession,
        "p-alice",
        removalTime,
      ),
    ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));

    expect(sessionState(bookingSession)).toEqual(previousState);
  });

  test("removeParticipant_WhenBookerRemovesParticipant_RefundsHold", () => {
    // Input
    const removalTime = hoursBeforeSessionStart(48);
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });

    // Log
    const removal = readyBooker().removeParticipant(
      bookingSession,
      "p-alice",
      removalTime,
    );

    const removed =
      bookingSession.participantList.requireParticipation("p-alice");

    // Oracle
    expect(removal.instructions).toEqual([
      expect.objectContaining({
        kind: "REFUND",
        participationId: "p-alice",
        holdId: "h-alice",
        walletId: "w-alice",
      }),
    ]);
    expect(removal.instructions[0]?.amount.toCents()).toBe(500);
    expect(removed.status).toBe("REMOVED");
    expect(removed.hold?.state).toBe("REFUNDED");
  });

  test("cancel_WhenSessionStartsNow_RejectsWithoutChangingState", () => {
    // Input
    const bookingSession = createTestSession({ committedUserIds: ["alice"] });
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() => readyBooker().cancel(bookingSession, sessionStartsAt)).toThrow(
      expect.objectContaining({ code: "SESSION_STARTED" }),
    );

    expect(sessionState(bookingSession)).toEqual(previousState);
  });

  test("cancel_WhenRosterIncludesActiveWithdrawnAndWaitingParticipants_RefundsHoldsAndClearsQueue", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(2);
    const cancellationTime = hoursBeforeSessionStart(1);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
      waitlistedUserIds: ["cara"],
    });
    createTestUser({ userId: "alice" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-alice",
        now: withdrawalTime,
      });

    // Log
    const cancellation = readyBooker().cancel(bookingSession, cancellationTime);
    const sessionStatus = bookingSession.status;
    const nextWaiter = bookingSession.participantList.nextWaitlisted();
    const participations = bookingSession.participantList.participations;

    // Oracle
    expect(cancellation.instructions).toHaveLength(2);
    expect(
      cancellation.instructions.map((instruction) => instruction.kind),
    ).toEqual(["REFUND", "REFUND"]);
    expect(sessionStatus).toBe("CANCELLED");
    expect(nextWaiter?.userId).toBeUndefined();
    expect(
      participations.map((participation) => participation.hold?.state),
    ).toEqual(["REFUNDED", "REFUNDED", undefined]);
  });
});
