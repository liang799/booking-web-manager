import { DomainError } from "@/domain";
import { describe, expect, test, vi } from "vitest";
import {
  hoursBeforeSessionStart,
  createTestUser,
  createTestSession,
  sessionState,
  sessionStartsAt,
} from "../../sessions/session/session-fixtures";

describe("Participant", () => {
  test("promoteFromWaitlist_WhenEmailIsUnverified_PromotesAndHoldsFunds", () => {
    // Input
    const bookingSession = createTestSession({
      waitlistedUserIds: ["alice", "ben"],
    });
    const alice = createTestUser({
      userId: "alice",
      emailVerified: false,
    }).asParticipant();

    // Log
    const promotion = alice.promoteFromWaitlist(bookingSession, {
      holdId: "h-alice",
      now: hoursBeforeSessionStart(48),
    });
    const aliceParticipation =
      bookingSession.participantList.requireParticipation("p-alice");
    const nextWaiter = bookingSession.participantList.nextWaitlisted();
    const committedCount = bookingSession.participantList.committedCount;

    // Oracle
    expect(promotion.kind).toBe("PROMOTED");
    expect(promotion.instructions).toHaveLength(1);
    expect(aliceParticipation.status).toBe("COMMITTED");
    expect(nextWaiter?.userId).toBe("ben");
    expect(committedCount).toBe(1);
  });

  test("promoteFromWaitlist_WhenFirstWaiterHasPendingInvitation_RejectsWithoutAcceptingOrMovingQueue", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(10);
    const promotionTime = hoursBeforeSessionStart(9);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
      waitlistedUserIds: ["cara", "dana"],
    });
    createTestUser({ userId: "ben" }).asParticipant().withdraw(bookingSession, {
      participationId: "p-ben",
      now: withdrawalTime,
      replacementMode: "DIRECT_INVITE",
      replacementInviteeId: "cara",
    });
    const queueSequence = bookingSession.participantList.nextQueueSequence;
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      createTestUser({ userId: "cara" })
        .asParticipant()
        .promoteFromWaitlist(bookingSession, {
          holdId: "h-cara",
          now: promotionTime,
        }),
    ).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));

    // Log
    const currentState = sessionState(bookingSession);
    const caraParticipation =
      bookingSession.participantList.requireParticipation("p-cara");
    const caraInvitation =
      bookingSession.participantList.personalReplacementForInvitee("cara");
    const committedCount = bookingSession.participantList.committedCount;
    const availableSlots = bookingSession.getAvailableSlots(promotionTime);
    const nextWaiter = bookingSession.participantList.nextWaitlisted();
    const nextQueueSequence = bookingSession.participantList.nextQueueSequence;

    // Oracle
    expect(currentState).toEqual(previousState);
    expect(caraParticipation.status).toBe("WAITLISTED");
    expect(caraInvitation?.participationId).toBe("p-ben");
    expect(committedCount).toBe(1);
    expect(availableSlots).toBe(0);
    expect(nextWaiter?.userId).toBe("cara");
    expect(nextQueueSequence).toBe(queueSequence);
  });

  test("promoteFromWaitlist_WhenOnlyVacancyIsReserved_RejectsWithoutMovingTheQueue", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(10);
    const promotionTime = hoursBeforeSessionStart(9);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
      waitlistedUserIds: ["dana", "evan"],
    });
    createTestUser({ userId: "ben" }).asParticipant().withdraw(bookingSession, {
      participationId: "p-ben",
      now: withdrawalTime,
      replacementMode: "DIRECT_INVITE",
      replacementInviteeId: "cara",
    });
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      createTestUser({ userId: "dana" })
        .asParticipant()
        .promoteFromWaitlist(bookingSession, {
          holdId: "h-dana",
          now: promotionTime,
        }),
    ).toThrow(expect.objectContaining({ code: "CAPACITY_EXCEEDED" }));

    // Log
    const currentState = sessionState(bookingSession);
    const nextWaiter = bookingSession.participantList.nextWaitlisted();

    // Oracle
    expect(currentState).toEqual(previousState);
    expect(nextWaiter?.userId).toBe("dana");
  });

  test("promoteFromWaitlist_WhenAnOlderWithdrawalIsReserved_RefundsOnlyTheOpenWithdrawal", () => {
    // Input
    const benWithdrawalTime = hoursBeforeSessionStart(10);
    const aliceWithdrawalTime = hoursBeforeSessionStart(9);
    const promotionTime = hoursBeforeSessionStart(8);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
      waitlistedUserIds: ["dana", "evan"],
    });
    createTestUser({ userId: "ben" }).asParticipant().withdraw(bookingSession, {
      participationId: "p-ben",
      now: benWithdrawalTime,
      replacementMode: "DIRECT_INVITE",
      replacementInviteeId: "cara",
    });
    createTestUser({ userId: "alice" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-alice",
        now: aliceWithdrawalTime,
        replacementMode: "OPEN_SLOT",
      });

    // Log
    const promotion = createTestUser({ userId: "dana" })
      .asParticipant()
      .promoteFromWaitlist(bookingSession, {
        holdId: "h-dana",
        now: promotionTime,
      });
    const danaParticipation =
      bookingSession.participantList.requireParticipation("p-dana");
    const benParticipation =
      bookingSession.participantList.requireParticipation("p-ben");
    const nextWaiter = bookingSession.participantList.nextWaitlisted();
    const availableSlots = bookingSession.getAvailableSlots(promotionTime);

    // Oracle
    expect(promotion.kind).toBe("PROMOTED");
    expect(promotion.refundedParticipationId).toBe("p-alice");
    expect(
      promotion.instructions.map((instruction) => instruction.kind),
    ).toEqual(["LOCK", "REFUND"]);
    expect(danaParticipation.replacesParticipationId).toBe("p-alice");
    expect(benParticipation.hold?.state).toBe("AWAITING_REPLACEMENT");
    expect(nextWaiter?.userId).toBe("evan");
    expect(availableSlots).toBe(0);
  });

  test("promoteFromWaitlist_WhenQueueIsEmpty_ReturnsNoneBeforeValidatingHoldId", () => {
    // Input
    const bookingSession = createTestSession();
    const previousState = sessionState(bookingSession);

    // Log
    const promotion = createTestUser({ userId: "alice" })
      .asParticipant()
      .promoteFromWaitlist(bookingSession, {
        holdId: "",
        now: hoursBeforeSessionStart(48),
      });
    const currentState = sessionState(bookingSession);

    // Oracle
    expect(promotion).toEqual({ kind: "NONE", instructions: [] });
    expect(currentState).toEqual(previousState);
  });

  test("promoteFromWaitlist_WhenSessionHasStartedAndQueueIsEmpty_RejectsBeforeReturningNone", () => {
    // Input
    const bookingSession = createTestSession();
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      createTestUser({ userId: "alice" })
        .asParticipant()
        .promoteFromWaitlist(bookingSession, {
          holdId: "",
          now: sessionStartsAt,
        }),
    ).toThrow(
      expect.objectContaining({
        code: "SESSION_STARTED",
        message: "The session has started",
      }),
    );

    // Log
    const currentState = sessionState(bookingSession);

    // Oracle
    expect(currentState).toEqual(previousState);
  });

  test("promoteFromWaitlist_WhenReplacementRefundFails_LeavesRosterQueueAndHoldsUnchanged", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(2);
    const promotionTime = hoursBeforeSessionStart(1);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
      waitlistedUserIds: ["first-waiter", "second-waiter"],
    });
    createTestUser({ userId: "alice" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-alice",
        now: withdrawalTime,
      });
    const previousState = sessionState(bookingSession);
    const awaiting =
      bookingSession.participantList.requireParticipation("p-alice");

    // Simulate the replacement refund failing during promotion.
    const refund = vi
      .spyOn(awaiting, "refundReplacement")
      .mockImplementationOnce(() => {
        throw new DomainError("INVALID_STATE", "Replacement refund failed");
      });

    try {
      // Log & Oracle
      expect(() =>
        createTestUser({ userId: "first-waiter" })
          .asParticipant()
          .promoteFromWaitlist(bookingSession, {
            holdId: "h-promoted",
            now: promotionTime,
          }),
      ).toThrow(
        new DomainError("INVALID_STATE", "Replacement refund failed"),
      );

      // Log
      const currentState = sessionState(bookingSession);
      const nextWaiterId = bookingSession.participantList.nextWaitlisted()?.userId;

      // Oracle
      expect(refund).toHaveBeenCalledOnce();
      expect(currentState).toEqual(previousState);
      expect(nextWaiterId).toBe("first-waiter");
    } finally {
      refund.mockRestore();
    }
  });

  test("promoteFromWaitlist_WhenLoadedUserDoesNotMatchNextWaiter_RejectsWithoutChangingState", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(48);
    const promotionTime = hoursBeforeSessionStart(48);
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
    const previousState = sessionState(bookingSession);

    // Log & Oracle
    expect(() =>
      createTestUser({ userId: "other" })
        .asParticipant()
        .promoteFromWaitlist(bookingSession, {
          holdId: "h-cara",
          now: promotionTime,
        }),
    ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));

    // Log
    const currentState = sessionState(bookingSession);

    // Oracle
    expect(currentState).toEqual(previousState);
  });

  test("promoteFromWaitlist_WhenReloadedWaiterHasFunds_PromotesFromUpdatedWallet", () => {
    // Input
    const waitlistJoinTime = hoursBeforeSessionStart(48);
    const withdrawalTime = hoursBeforeSessionStart(48);
    const promotionTime = hoursBeforeSessionStart(48);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
    });
    const unfundedUser = createTestUser({
      userId: "cara",
      availableFundsCents: 0,
    });
    const waitlistAdmission = unfundedUser
      .asParticipant()
      .join(bookingSession, {
        participationId: "p-cara",
        now: waitlistJoinTime,
      });
    createTestUser({ userId: "alice" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-alice",
        now: withdrawalTime,
      });
    const reloadedUser = createTestUser({
      userId: "cara",
      availableFundsCents: 500,
    });

    // Log
    const promotion = reloadedUser
      .asParticipant()
      .promoteFromWaitlist(bookingSession, {
        holdId: "h-cara",
        now: promotionTime,
      });
    const unfundedUserAvailableFunds =
      unfundedUser.wallet.getAvailableBalance();
    const reloadedUserAvailableFunds =
      reloadedUser.wallet.getAvailableBalance();

    // Oracle
    expect(waitlistAdmission.kind).toBe("WAITLISTED");
    expect(promotion.kind).toBe("PROMOTED");
    expect(promotion.instructions[0]?.walletId).toBe("w-cara");
    expect(unfundedUserAvailableFunds.toCents()).toBe(0);
    expect(reloadedUserAvailableFunds.toCents()).toBe(500);
  });

  test("promoteFromWaitlist_WhenFirstWaiterCannotPay_SkipsThemAndSelectsNextWaiter", () => {
    // Input
    const promotionTime = hoursBeforeSessionStart(48);
    const bookingSession = createTestSession({
      committedUserIds: ["ben"],
      waitlistedUserIds: ["cara", "dana", "evan"],
    });
    const cara = createTestUser({
      userId: "cara",
      availableFundsCents: 0,
    }).asParticipant();
    const queueSequence = bookingSession.participantList.nextQueueSequence;

    // Log
    const promotion = cara.promoteFromWaitlist(bookingSession, {
      holdId: "h-cara",
      now: promotionTime,
    });
    const caraParticipation =
      bookingSession.participantList.requireParticipation("p-cara");
    const nextWaiter = bookingSession.participantList.nextWaitlisted();
    const nextQueueSequence = bookingSession.participantList.nextQueueSequence;
    const availableSlots = bookingSession.getAvailableSlots(promotionTime);

    // Oracle
    expect(promotion).toEqual({
      kind: "SKIPPED",
      participationId: "p-cara",
      reason: "INSUFFICIENT_FUNDS",
      instructions: [],
    });
    expect(caraParticipation.status).toBe("LEFT_WAITLIST");
    expect(nextWaiter?.userId).toBe("dana");
    expect(nextQueueSequence).toBe(queueSequence);
    expect(availableSlots).toBe(1);
  });

  test("promoteFromWaitlist_WhenFirstTiedWaiterWasSkipped_PromotesNextWaiter", () => {
    // Input
    const firstPromotionTime = hoursBeforeSessionStart(48);
    const nextPromotionTime = hoursBeforeSessionStart(48);
    const bookingSession = createTestSession({
      committedUserIds: ["ben"],
      waitlistedUserIds: ["cara", "dana", "evan"],
    });
    createTestUser({ userId: "cara", availableFundsCents: 0 })
      .asParticipant()
      .promoteFromWaitlist(bookingSession, {
        holdId: "h-cara",
        now: firstPromotionTime,
      });
    const dana = createTestUser({
      userId: "dana",
      availableFundsCents: 500,
    }).asParticipant();

    // Log
    const promotion = dana.promoteFromWaitlist(bookingSession, {
      holdId: "h-dana",
      now: nextPromotionTime,
    });
    const danaParticipation =
      bookingSession.participantList.requireParticipation("p-dana");
    const nextWaiter = bookingSession.participantList.nextWaitlisted();

    // Oracle
    expect(promotion.kind).toBe("PROMOTED");
    expect(promotion.participationId).toBe("p-dana");
    expect(promotion.instructions).toEqual([
      expect.objectContaining({
        kind: "LOCK",
        participationId: "p-dana",
        holdId: "h-dana",
      }),
    ]);
    expect(promotion.instructions[0]?.amount.toCents()).toBe(500);
    expect(danaParticipation.status).toBe("COMMITTED");
    expect(nextWaiter?.userId).toBe("evan");
  });

  test("promoteFromWaitlist_WhenParticipantChoosesOpenWaitlist_AdmitsFirstWaiterAndRefundsTheirShare", () => {
    // Input
    const withdrawalTime = hoursBeforeSessionStart(10);
    const promotionTime = hoursBeforeSessionStart(8);
    const bookingSession = createTestSession({
      committedUserIds: ["ben", "alex"],
      waitlistedUserIds: ["dana", "evan"],
    });
    const ben = createTestUser({ userId: "ben" }).asParticipant();
    ben.withdraw(bookingSession, {
      participationId: "p-ben",
      now: withdrawalTime,
      replacementMode: "OPEN_SLOT",
    });
    const dana = createTestUser({ userId: "dana" }).asParticipant();
    const queueSequence = bookingSession.participantList.nextQueueSequence;

    // Log
    const promotion = dana.promoteFromWaitlist(bookingSession, {
      holdId: "h-dana",
      now: promotionTime,
    });
    const benParticipation =
      bookingSession.participantList.requireParticipation("p-ben");
    const danaParticipation =
      bookingSession.participantList.requireParticipation("p-dana");
    const nextWaiter = bookingSession.participantList.nextWaitlisted();
    const nextQueueSequence = bookingSession.participantList.nextQueueSequence;

    // Oracle
    expect(promotion).toMatchObject({
      kind: "PROMOTED",
      participationId: "p-dana",
      refundedParticipationId: "p-ben",
    });
    expect(promotion.instructions).toEqual([
      expect.objectContaining({
        kind: "LOCK",
        participationId: "p-dana",
        holdId: "h-dana",
      }),
      expect.objectContaining({
        kind: "REFUND",
        participationId: "p-ben",
        holdId: "h-ben",
      }),
    ]);
    expect(
      promotion.instructions.map((instruction) => instruction.amount.toCents()),
    ).toEqual([500, 500]);
    expect(benParticipation.hold?.state).toBe("REFUNDED");
    expect(danaParticipation.hold?.state).toBe("HELD");
    expect(danaParticipation.replacesParticipationId).toBe("p-ben");
    expect(nextWaiter?.userId).toBe("evan");
    expect(nextQueueSequence).toBe(queueSequence);
  });

  test("promoteFromWaitlist_WhenTwoParticipantsChooseOpenWaitlist_RefundsEarlierWithdrawal", () => {
    // Input
    const benWithdrawalTime = hoursBeforeSessionStart(10);
    const aliceWithdrawalTime = hoursBeforeSessionStart(9);
    const promotionTime = hoursBeforeSessionStart(7);
    const bookingSession = createTestSession({
      committedUserIds: ["alice", "ben"],
      waitlistedUserIds: ["dana"],
    });
    createTestUser({ userId: "ben" }).asParticipant().withdraw(bookingSession, {
      participationId: "p-ben",
      now: benWithdrawalTime,
      replacementMode: "OPEN_SLOT",
    });
    createTestUser({ userId: "alice" })
      .asParticipant()
      .withdraw(bookingSession, {
        participationId: "p-alice",
        now: aliceWithdrawalTime,
        replacementMode: "OPEN_SLOT",
      });

    // Log
    const promotion = createTestUser({ userId: "dana" })
      .asParticipant()
      .promoteFromWaitlist(bookingSession, {
        holdId: "h-dana",
        now: promotionTime,
      });

    const ben = bookingSession.participantList.findByUserId("ben");
    const alice = bookingSession.participantList.findByUserId("alice");
    const dana = bookingSession.participantList.findByUserId("dana");

    // Oracle
    expect(promotion).toMatchObject({
      kind: "PROMOTED",
      refundedParticipationId: "p-ben",
      instructions: [
        { kind: "LOCK", participationId: "p-dana" },
        { kind: "REFUND", participationId: "p-ben" },
      ],
    });
    expect(ben?.withdrawnAt).toEqual(benWithdrawalTime);
    expect(ben?.hold?.state).toBe("REFUNDED");
    expect(alice?.withdrawnAt).toEqual(aliceWithdrawalTime);
    expect(alice?.hold?.state).toBe("AWAITING_REPLACEMENT");
    expect(dana?.replacesParticipationId).toBe("p-ben");
  });
});
