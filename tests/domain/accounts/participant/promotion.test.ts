import { DomainError } from "@/domain";
import { describe, expect, test, vi } from "vitest";
import {
  hoursBeforeSessionStart,
  leftWaitlistedParticipation,
  withdrawnParticipation,
  createTestUser,
  createTestSession,
  sessionState,
  sessionStartsAt,
} from "../../sessions/session/session-fixtures";

describe("Participant waitlist promotion", () => {
  describe("Promotion eligibility and empty queues", () => {
    test("promoteFromWaitlist_WhenEmailIsUnverified_PromotesAndHoldsFunds", () => {
      const bookingSession = createTestSession({
        waitlistedUserIds: ["alice", "ben"],
      });
      const alice = createTestUser({
        userId: "alice",
        emailVerified: false,
      }).asParticipant();

      const promotion = alice.promoteFromWaitlist(bookingSession, {
        holdId: "h-alice",
        now: hoursBeforeSessionStart(48),
      });

      expect(promotion.kind).toBe("PROMOTED");
      expect(promotion.instructions).toHaveLength(1);
      expect(
        bookingSession.participantList.requireParticipation("p-alice").status,
      ).toBe("COMMITTED");
      expect(bookingSession.participantList.nextWaitlisted()?.userId).toBe(
        "ben",
      );
      expect(bookingSession.participantList.committedCount).toBe(1);
    });

    test("promoteFromWaitlist_WhenQueueIsEmpty_ReturnsNoneBeforeValidatingHoldId", () => {
      const bookingSession = createTestSession();
      const previousState = sessionState(bookingSession);

      const promotion = createTestUser({ userId: "alice" })
        .asParticipant()
        .promoteFromWaitlist(bookingSession, {
          holdId: "",
          now: hoursBeforeSessionStart(48),
        });

      expect(promotion).toEqual({ kind: "NONE", instructions: [] });
      expect(sessionState(bookingSession)).toEqual(previousState);
    });

    test("promoteFromWaitlist_WhenSessionHasStartedAndQueueIsEmpty_RejectsBeforeReturningNone", () => {
      const bookingSession = createTestSession();
      const previousState = sessionState(bookingSession);

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

      expect(sessionState(bookingSession)).toEqual(previousState);
    });

    test("promoteFromWaitlist_WhenLoadedUserDoesNotMatchNextWaiter_RejectsWithoutChangingState", () => {
      const withdrawalTime = hoursBeforeSessionStart(48);
      const promotionTime = hoursBeforeSessionStart(48);
      const bookingSession = createTestSession({
        committedUserIds: ["alice", "ben"],
        waitlistedUserIds: ["cara"],
        participationOverrides: {
          alice: withdrawnParticipation("alice", {
            withdrawnAt: withdrawalTime,
            replacementMode: "OPEN_SLOT",
            holdState: "REFUNDED",
            settledAt: withdrawalTime,
          }),
        },
      });
      const previousState = sessionState(bookingSession);

      expect(() =>
        createTestUser({ userId: "other" })
          .asParticipant()
          .promoteFromWaitlist(bookingSession, {
            holdId: "h-cara",
            now: promotionTime,
          }),
      ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));

      expect(sessionState(bookingSession)).toEqual(previousState);
    });
  });

  describe("FIFO selection and wallet funds", () => {
    test("promoteFromWaitlist_WhenReloadedWaiterHasFunds_PromotesFromUpdatedWallet", () => {
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

      const promotion = reloadedUser
        .asParticipant()
        .promoteFromWaitlist(bookingSession, {
          holdId: "h-cara",
          now: promotionTime,
        });

      expect(waitlistAdmission.kind).toBe("WAITLISTED");
      expect(promotion.kind).toBe("PROMOTED");
      expect(promotion.instructions[0]?.walletId).toBe("w-cara");
      expect(unfundedUser.wallet.getAvailableBalance().toCents()).toBe(0);
      expect(reloadedUser.wallet.getAvailableBalance().toCents()).toBe(500);
    });

    test("promoteFromWaitlist_WhenFirstWaiterCannotPay_SkipsThemAndSelectsNextWaiter", () => {
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

      const promotion = cara.promoteFromWaitlist(bookingSession, {
        holdId: "h-cara",
        now: promotionTime,
      });

      expect(promotion).toEqual({
        kind: "SKIPPED",
        participationId: "p-cara",
        reason: "INSUFFICIENT_FUNDS",
        instructions: [],
      });
      expect(
        bookingSession.participantList.requireParticipation("p-cara").status,
      ).toBe("LEFT_WAITLIST");
      expect(bookingSession.participantList.nextWaitlisted()?.userId).toBe(
        "dana",
      );
      expect(bookingSession.participantList.nextQueueSequence).toBe(
        queueSequence,
      );
      expect(bookingSession.getAvailableSlots(promotionTime)).toBe(1);
    });

    test("promoteFromWaitlist_WhenFirstTiedWaiterWasSkipped_PromotesNextWaiter", () => {
      const nextPromotionTime = hoursBeforeSessionStart(48);
      const bookingSession = createTestSession({
        committedUserIds: ["ben"],
        waitlistedUserIds: ["cara", "dana", "evan"],
        participationOverrides: {
          cara: leftWaitlistedParticipation("cara", 1),
        },
      });
      const dana = createTestUser({
        userId: "dana",
        availableFundsCents: 500,
      }).asParticipant();

      const promotion = dana.promoteFromWaitlist(bookingSession, {
        holdId: "h-dana",
        now: nextPromotionTime,
      });

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
      expect(
        bookingSession.participantList.requireParticipation("p-dana").status,
      ).toBe("COMMITTED");
      expect(bookingSession.participantList.nextWaitlisted()?.userId).toBe(
        "evan",
      );
    });
  });

  describe("Replacement reservations and refunds", () => {
    test("promoteFromWaitlist_WhenFirstWaiterHasPendingInvitation_RejectsWithoutAcceptingOrMovingQueue", () => {
      const withdrawalTime = hoursBeforeSessionStart(10);
      const promotionTime = hoursBeforeSessionStart(9);
      const bookingSession = createTestSession({
        committedUserIds: ["alice", "ben"],
        waitlistedUserIds: ["cara", "dana"],
        participationOverrides: {
          ben: withdrawnParticipation("ben", {
            withdrawnAt: withdrawalTime,
            replacementMode: "DIRECT_INVITE",
            replacementInviteeId: "cara",
            holdState: "AWAITING_REPLACEMENT",
          }),
        },
      });
      const queueSequence = bookingSession.participantList.nextQueueSequence;
      const previousState = sessionState(bookingSession);

      expect(() =>
        createTestUser({ userId: "cara" })
          .asParticipant()
          .promoteFromWaitlist(bookingSession, {
            holdId: "h-cara",
            now: promotionTime,
          }),
      ).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));

      expect(sessionState(bookingSession)).toEqual(previousState);
      expect(
        bookingSession.participantList.requireParticipation("p-cara").status,
      ).toBe("WAITLISTED");
      expect(
        bookingSession.participantList.personalReplacementForInvitee("cara")
          ?.participationId,
      ).toBe("p-ben");
      expect(bookingSession.participantList.committedCount).toBe(1);
      expect(bookingSession.getAvailableSlots(promotionTime)).toBe(0);
      expect(bookingSession.participantList.nextWaitlisted()?.userId).toBe(
        "cara",
      );
      expect(bookingSession.participantList.nextQueueSequence).toBe(
        queueSequence,
      );
    });

    test("promoteFromWaitlist_WhenOnlyVacancyIsReserved_RejectsWithoutMovingTheQueue", () => {
      const withdrawalTime = hoursBeforeSessionStart(10);
      const promotionTime = hoursBeforeSessionStart(9);
      const bookingSession = createTestSession({
        committedUserIds: ["alice", "ben"],
        waitlistedUserIds: ["dana", "evan"],
        participationOverrides: {
          ben: withdrawnParticipation("ben", {
            withdrawnAt: withdrawalTime,
            replacementMode: "DIRECT_INVITE",
            replacementInviteeId: "cara",
            holdState: "AWAITING_REPLACEMENT",
          }),
        },
      });
      const previousState = sessionState(bookingSession);

      expect(() =>
        createTestUser({ userId: "dana" })
          .asParticipant()
          .promoteFromWaitlist(bookingSession, {
            holdId: "h-dana",
            now: promotionTime,
          }),
      ).toThrow(expect.objectContaining({ code: "CAPACITY_EXCEEDED" }));

      expect(sessionState(bookingSession)).toEqual(previousState);
      expect(bookingSession.participantList.nextWaitlisted()?.userId).toBe(
        "dana",
      );
    });

    test("promoteFromWaitlist_WhenAnOlderWithdrawalIsReserved_RefundsOnlyTheOpenWithdrawal", () => {
      const benWithdrawalTime = hoursBeforeSessionStart(10);
      const aliceWithdrawalTime = hoursBeforeSessionStart(9);
      const promotionTime = hoursBeforeSessionStart(8);
      const bookingSession = createTestSession({
        committedUserIds: ["alice", "ben"],
        waitlistedUserIds: ["dana", "evan"],
        participationOverrides: {
          ben: withdrawnParticipation("ben", {
            withdrawnAt: benWithdrawalTime,
            replacementMode: "DIRECT_INVITE",
            replacementInviteeId: "cara",
            holdState: "AWAITING_REPLACEMENT",
          }),
          alice: withdrawnParticipation("alice", {
            withdrawnAt: aliceWithdrawalTime,
            replacementMode: "OPEN_SLOT",
            holdState: "AWAITING_REPLACEMENT",
          }),
        },
      });

      const promotion = createTestUser({ userId: "dana" })
        .asParticipant()
        .promoteFromWaitlist(bookingSession, {
          holdId: "h-dana",
          now: promotionTime,
        });

      expect(promotion.kind).toBe("PROMOTED");
      expect(promotion.refundedParticipationId).toBe("p-alice");
      expect(
        promotion.instructions.map((instruction) => instruction.kind),
      ).toEqual(["LOCK", "REFUND"]);
      expect(
        bookingSession.participantList.requireParticipation("p-dana")
          .replacesParticipationId,
      ).toBe("p-alice");
      expect(
        bookingSession.participantList.requireParticipation("p-ben").hold
          ?.state,
      ).toBe("AWAITING_REPLACEMENT");
      expect(bookingSession.participantList.nextWaitlisted()?.userId).toBe(
        "evan",
      );
      expect(bookingSession.getAvailableSlots(promotionTime)).toBe(0);
    });

    test("promoteFromWaitlist_WhenReplacementRefundFails_LeavesRosterQueueAndHoldsUnchanged", () => {
      const withdrawalTime = hoursBeforeSessionStart(2);
      const promotionTime = hoursBeforeSessionStart(1);
      const bookingSession = createTestSession({
        committedUserIds: ["alice", "ben"],
        waitlistedUserIds: ["first-waiter", "second-waiter"],
        participationOverrides: {
          alice: withdrawnParticipation("alice", {
            withdrawnAt: withdrawalTime,
            replacementMode: "OPEN_SLOT",
            holdState: "AWAITING_REPLACEMENT",
          }),
        },
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

        expect(refund).toHaveBeenCalledOnce();
        expect(sessionState(bookingSession)).toEqual(previousState);
        expect(bookingSession.participantList.nextWaitlisted()?.userId).toBe(
          "first-waiter",
        );
      } finally {
        refund.mockRestore();
      }
    });

    test("promoteFromWaitlist_WhenParticipantChoosesOpenWaitlist_AdmitsFirstWaiterAndRefundsTheirShare", () => {
      const withdrawalTime = hoursBeforeSessionStart(10);
      const promotionTime = hoursBeforeSessionStart(8);
      const bookingSession = createTestSession({
        committedUserIds: ["ben", "alex"],
        waitlistedUserIds: ["dana", "evan"],
        participationOverrides: {
          ben: withdrawnParticipation("ben", {
            withdrawnAt: withdrawalTime,
            replacementMode: "OPEN_SLOT",
            holdState: "AWAITING_REPLACEMENT",
          }),
        },
      });
      const dana = createTestUser({ userId: "dana" }).asParticipant();
      const queueSequence = bookingSession.participantList.nextQueueSequence;

      const promotion = dana.promoteFromWaitlist(bookingSession, {
        holdId: "h-dana",
        now: promotionTime,
      });
      const danaParticipation =
        bookingSession.participantList.requireParticipation("p-dana");

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
        promotion.instructions.map((instruction) =>
          instruction.amount.toCents(),
        ),
      ).toEqual([500, 500]);
      expect(
        bookingSession.participantList.requireParticipation("p-ben").hold
          ?.state,
      ).toBe("REFUNDED");
      expect(danaParticipation.hold?.state).toBe("HELD");
      expect(danaParticipation.replacesParticipationId).toBe("p-ben");
      expect(bookingSession.participantList.nextWaitlisted()?.userId).toBe(
        "evan",
      );
      expect(bookingSession.participantList.nextQueueSequence).toBe(
        queueSequence,
      );
    });

    test("promoteFromWaitlist_WhenTwoParticipantsChooseOpenWaitlist_RefundsEarlierWithdrawal", () => {
      const benWithdrawalTime = hoursBeforeSessionStart(10);
      const aliceWithdrawalTime = hoursBeforeSessionStart(9);
      const promotionTime = hoursBeforeSessionStart(7);
      const bookingSession = createTestSession({
        committedUserIds: ["alice", "ben"],
        waitlistedUserIds: ["dana"],
        participationOverrides: {
          ben: withdrawnParticipation("ben", {
            withdrawnAt: benWithdrawalTime,
            replacementMode: "OPEN_SLOT",
            holdState: "AWAITING_REPLACEMENT",
          }),
          alice: withdrawnParticipation("alice", {
            withdrawnAt: aliceWithdrawalTime,
            replacementMode: "OPEN_SLOT",
            holdState: "AWAITING_REPLACEMENT",
          }),
        },
      });

      const promotion = createTestUser({ userId: "dana" })
        .asParticipant()
        .promoteFromWaitlist(bookingSession, {
          holdId: "h-dana",
          now: promotionTime,
        });

      const ben = bookingSession.participantList.findByUserId("ben");
      const alice = bookingSession.participantList.findByUserId("alice");

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
      expect(
        bookingSession.participantList.findByUserId("dana")
          ?.replacesParticipationId,
      ).toBe("p-ben");
    });
  });
});
