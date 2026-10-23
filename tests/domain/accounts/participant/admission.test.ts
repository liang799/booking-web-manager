import {
  DomainError,
  LedgerTransaction,
  Money,
  ReliabilityScore,
  Wallet,
} from "@/domain";
import { describe, expect, test, vi } from "vitest";
import {
  hoursBeforeSessionStart,
  creationDetails,
  createTestUser,
  readyBooker,
  createTestSession,
  sessionState,
  sessionStartsAt,
} from "../../sessions/session/session-fixtures";

describe("Participant", () => {
  describe("Admission and reentry", () => {
    test("join_WhenUserHasFunds_LocksShareFromLoadedWallet", () => {
      // Input
      const participantUser = createTestUser({ userId: "participant" });
      const session = createTestSession();

      // Log
      const admission = participantUser.asParticipant().join(session, {
        participationId: "participation",
        holdId: "hold",
        now: hoursBeforeSessionStart(48),
      });
      const participation =
        session.participantList.requireParticipation("participation");

      // Oracle
      expect(admission.kind).toBe("COMMITTED");
      expect(participation.userId).toBe(participantUser.userId);
      expect(admission.instructions).toEqual([
        expect.objectContaining({
          kind: "LOCK",
          walletId: "w-participant",
          participationId: "participation",
          holdId: "hold",
        }),
      ]);
      expect(admission.instructions[0]?.amount.toCents()).toBe(500);
    });

    test("join_WhenRoleWasCreatedBeforeDeactivation_ThrowsInactiveAccount", () => {
      // Input
      const participantUser = createTestUser({
        userId: "participant",
        availableFundsCents: 0,
      });
      const session = createTestSession();
      const participant = participantUser.asParticipant();
      participantUser.deactivate({
        availableBalance: Money.fromCents(0),
        heldBalance: Money.fromCents(0),
        activeCommitments: 0,
        unsettledOwnedSessions: 0,
        pendingPayouts: 0,
        activeOwnedGroups: 0,
      });

      // Log & Oracle
      expect(() =>
        participant.join(session, {
          participationId: "participation",
          holdId: "hold",
          now: hoursBeforeSessionStart(48),
        }),
      ).toThrow(expect.objectContaining({ code: "INACTIVE_ACCOUNT" }));

      // Log
      const participations = session.participantList.participations;

      // Oracle
      expect(participations).toEqual([]);
    });

    test("join_WhenRoleWasCreatedAfterDeactivation_ThrowsInactiveAccount", () => {
      // Input
      const participantUser = createTestUser({
        userId: "participant",
        availableFundsCents: 0,
      });
      const session = createTestSession();

      participantUser.deactivate({
        availableBalance: Money.fromCents(0),
        heldBalance: Money.fromCents(0),
        activeCommitments: 0,
        unsettledOwnedSessions: 0,
        pendingPayouts: 0,
        activeOwnedGroups: 0,
      });
      const participant = participantUser.asParticipant();

      // Log & Oracle
      expect(() =>
        participant.join(session, {
          participationId: "participation",
          holdId: "hold",
          now: hoursBeforeSessionStart(48),
        }),
      ).toThrow(expect.objectContaining({ code: "INACTIVE_ACCOUNT" }));

      // Log
      const participations = session.participantList.participations;

      // Oracle
      expect(participations).toEqual([]);
    });

    test("join_WhenEmailIsMissingAndSessionIsFull_RejectsWithoutChangingWaitlist", () => {
      // Input
      const bookingSession = createTestSession({
        committedUserIds: ["alice", "ben"],
      });
      const cara = createTestUser({
        userId: "cara",
        email: null,
        emailVerified: false,
      });
      const previousState = sessionState(bookingSession);

      // Log & Oracle
      expect(() =>
        cara.asParticipant().join(bookingSession, {
          participationId: "p-cara",
          now: hoursBeforeSessionStart(48),
        }),
      ).toThrow(expect.objectContaining({ code: "EMAIL_REQUIRED" }));

      // Log
      const currentState = sessionState(bookingSession);

      // Oracle
      expect(currentState).toEqual(previousState);
    });

    test("join_WhenEmailIsUnverified_AllowsAdmission", () => {
      // Input
      const bookingSession = createTestSession();
      const alice = createTestUser({ userId: "alice", emailVerified: false });

      // Log
      const admission = alice.asParticipant().join(bookingSession, {
        participationId: "p-alice",
        holdId: "h-alice",
        now: hoursBeforeSessionStart(48),
      });
      const aliceParticipation =
        bookingSession.participantList.requireParticipation("p-alice");
      const aliceAvailableFunds = alice.wallet.getAvailableBalance();

      // Oracle
      expect(admission.kind).toBe("COMMITTED");
      expect(aliceParticipation.status).toBe("COMMITTED");
      expect(aliceParticipation.hold?.state).toBe("HELD");
      expect(aliceParticipation.hold?.amount.toCents()).toBe(500);
      expect(aliceAvailableFunds.toCents()).toBe(10_000);
    });

    test("join_WhenReplacementRefundFails_LeavesRosterQueueAndHoldsUnchanged", () => {
      // Input
      const waitlistDepartureTime = hoursBeforeSessionStart(48);
      const withdrawalTime = hoursBeforeSessionStart(2);
      const replacementJoinTime = hoursBeforeSessionStart(1);
      const bookingSession = createTestSession({
        committedUserIds: ["alice", "ben"],
        waitlistedUserIds: ["former-waiter"],
      });

      createTestUser({ userId: "former-waiter" })
        .asParticipant()
        .leaveWaitlist(bookingSession, {
          participationId: "p-former-waiter",
          now: waitlistDepartureTime,
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

      // Simulate the replacement refund failing during admission.
      const refund = vi
        .spyOn(awaiting, "refundReplacement")
        .mockImplementationOnce(() => {
          throw new DomainError("INVALID_STATE", "Replacement refund failed");
        });

      try {
        // Log & Oracle
        expect(() =>
          createTestUser({ userId: "replacement" })
            .asParticipant()
            .join(bookingSession, {
              participationId: "p-replacement",
              holdId: "h-replacement",
              now: replacementJoinTime,
            }),
        ).toThrow(
          new DomainError("INVALID_STATE", "Replacement refund failed"),
        );

        // Log
        const currentState = sessionState(bookingSession);

        // Oracle
        expect(refund).toHaveBeenCalledOnce();
        expect(currentState).toEqual(previousState);
      } finally {
        refund.mockRestore();
      }
    });

    test("join_WhenFundsExactlyCoverShare_CommitsAndEmitsLock", () => {
      // Input
      const bookingSession = createTestSession();
      const fundedUser = createTestUser({
        userId: "alice",
        availableFundsCents: 500,
      });

      // Log
      const admission = fundedUser.asParticipant().join(bookingSession, {
        participationId: "p-alice",
        holdId: "h-alice",
        now: hoursBeforeSessionStart(48),
      });

      // Oracle
      expect(admission.kind).toBe("COMMITTED");
      expect(admission.instructions).toEqual([
        expect.objectContaining({
          kind: "LOCK",
          participationId: "p-alice",
          holdId: "h-alice",
          walletId: "w-alice",
        }),
      ]);
      expect(admission.instructions[0]?.amount.toCents()).toBe(500);
    });

    test("join_WhenSessionIsFullAndUserHasNoFunds_JoinsWaitlistWithoutLockingFunds", () => {
      // Input
      const bookingSession = createTestSession({
        committedUserIds: ["alice", "ben"],
      });
      const cara = createTestUser({
        userId: "cara",
        availableFundsCents: 0,
      }).asParticipant();

      // Log
      const admission = cara.join(bookingSession, {
        participationId: "p-cara",
        now: hoursBeforeSessionStart(48),
      });
      const waiting =
        bookingSession.participantList.requireParticipation("p-cara");
      const nextWaiter = bookingSession.participantList.nextWaitlisted();

      // Oracle
      expect(admission).toEqual({
        kind: "WAITLISTED",
        participationId: "p-cara",
        instructions: [],
      });
      expect(waiting.status).toBe("WAITLISTED");
      expect(waiting.hold).toBeUndefined();
      expect(nextWaiter?.userId).toBe("cara");
    });

    test("join_WhenWaitersExistAndSlotIsAvailable_QueuesBehindExistingWaiters", () => {
      // Input
      const joinTime = hoursBeforeSessionStart(48);
      const bookingSession = createTestSession({
        committedUserIds: ["ben"],
        waitlistedUserIds: ["cara", "dana"],
      });
      const evan = createTestUser({ userId: "evan" }).asParticipant();

      // Log
      const admission = evan.join(bookingSession, {
        participationId: "p-evan",
        holdId: "h-evan",
        now: joinTime,
      });
      const evanParticipation =
        bookingSession.participantList.requireParticipation("p-evan");
      const nextWaiter = bookingSession.participantList.nextWaitlisted();
      const nextQueueSequence =
        bookingSession.participantList.nextQueueSequence;
      const availableSlots = bookingSession.getAvailableSlots(joinTime);

      // Oracle
      expect(admission.kind).toBe("WAITLISTED");
      expect(admission.instructions).toEqual([]);
      expect(evanParticipation.queueSequence).toBe(3);
      expect(nextWaiter?.userId).toBe("cara");
      expect(nextQueueSequence).toBe(4);
      expect(availableSlots).toBe(1);
    });

    test("join_WhenReloadedWalletIncludesPriorLock_RejectsWithoutChangingState", () => {
      // Input
      const commitmentTime = hoursBeforeSessionStart(48);
      const fundedUser = createTestUser({
        userId: "alice",
        availableFundsCents: 500,
      });
      const command = {
        participationId: "p-alice",
        holdId: "h-alice",
        now: commitmentTime,
      };
      fundedUser.asParticipant().join(createTestSession(), command);
      const reloadedUser = createTestUser({
        userId: "alice",
        wallet: new Wallet({
          walletId: fundedUser.wallet.walletId,
          userId: fundedUser.userId,
          transactions: [
            ...fundedUser.wallet.transactions,
            new LedgerTransaction({
              transactionId: "lock-alice",
              walletId: fundedUser.wallet.walletId,
              kind: "LOCK",
              amount: Money.fromCents(500),
              occurredAt: commitmentTime,
              idempotencyKey: "lock-alice",
              holdId: "h-alice",
            }),
          ],
        }),
      });
      const nextSession = createTestSession();
      const previousState = sessionState(nextSession);

      // Log & Oracle
      expect(() =>
        reloadedUser.asParticipant().join(nextSession, command),
      ).toThrow(expect.objectContaining({ code: "INSUFFICIENT_FUNDS" }));

      // Log
      const currentState = sessionState(nextSession);
      const fundedUserAvailableFunds = fundedUser.wallet.getAvailableBalance();
      const reloadedUserAvailableFunds =
        reloadedUser.wallet.getAvailableBalance();

      // Oracle
      expect(currentState).toEqual(previousState);
      expect(fundedUserAvailableFunds.toCents()).toBe(500);
      expect(reloadedUserAvailableFunds.toCents()).toBe(0);
    });

    test("join_WhenUserIsNotInInvitedGroup_RejectsWithoutChangingState", () => {
      // Input
      const privateSession = readyBooker().createSession({
        ...creationDetails(),
        visibility: "PRIVATE",
        invitedGroupId: "group",
        minimumReliability: ReliabilityScore.from(80),
      });
      const command = {
        participationId: "p-alice",
        holdId: "h-alice",
        now: hoursBeforeSessionStart(48),
      };
      const alice = createTestUser({ userId: "alice" });
      const previousState = sessionState(privateSession);

      // Log & Oracle
      expect(() => alice.asParticipant().join(privateSession, command)).toThrow(
        expect.objectContaining({ code: "INVALID_ACCESS" }),
      );

      // Log
      const currentState = sessionState(privateSession);

      // Oracle
      expect(currentState).toEqual(previousState);
    });

    test("join_WhenMemberIsBelowReliabilityThreshold_RejectsWithoutChangingState", () => {
      // Input
      const privateSession = readyBooker().createSession({
        ...creationDetails(),
        visibility: "PRIVATE",
        invitedGroupId: "group",
        minimumReliability: ReliabilityScore.from(80),
      });
      const command = {
        participationId: "p-alice",
        holdId: "h-alice",
        now: hoursBeforeSessionStart(48),
      };
      const alice = createTestUser({
        userId: "alice",
        memberGroupIds: ["group"],
        reliabilityScore: ReliabilityScore.from(79),
      });
      const previousState = sessionState(privateSession);

      // Log & Oracle
      expect(() => alice.asParticipant().join(privateSession, command)).toThrow(
        expect.objectContaining({ code: "LOW_RELIABILITY" }),
      );

      // Log
      const currentState = sessionState(privateSession);

      // Oracle
      expect(currentState).toEqual(previousState);
    });

    test("join_WhenInvitedMemberMeetsReliabilityThreshold_CommitsFromLoadedWallet", () => {
      // Input
      const privateSession = readyBooker().createSession({
        ...creationDetails(),
        visibility: "PRIVATE",
        invitedGroupId: "group",
        minimumReliability: ReliabilityScore.from(80),
      });
      const eligibleUser = createTestUser({
        userId: "alice",
        memberGroupIds: ["group"],
        reliabilityScore: ReliabilityScore.from(80),
      });

      // Log
      const admission = eligibleUser.asParticipant().join(privateSession, {
        participationId: "p-alice",
        holdId: "h-alice",
        now: hoursBeforeSessionStart(48),
      });

      // Oracle
      expect(admission.kind).toBe("COMMITTED");
      expect(admission.instructions[0]?.walletId).toBe(
        eligibleUser.wallet.walletId,
      );
    });

    test("join_WhenUserIsInactive_RejectsWithoutChangingState", () => {
      // Input
      const bookingSession = createTestSession();
      const alice = createTestUser({
        userId: "alice",
        accountStatus: "INACTIVE",
      });
      const previousState = sessionState(bookingSession);

      // Log & Oracle
      expect(() =>
        alice.asParticipant().join(bookingSession, {
          participationId: "p-alice",
          holdId: "h-alice",
          now: hoursBeforeSessionStart(48),
        }),
      ).toThrow(expect.objectContaining({ code: "INACTIVE_ACCOUNT" }));

      // Log
      const currentState = sessionState(bookingSession);

      // Oracle
      expect(currentState).toEqual(previousState);
    });

    test("join_WhenFundsAreOneCentBelowShare_RejectsWithoutChangingState", () => {
      // Input
      const bookingSession = createTestSession();
      const alice = createTestUser({
        userId: "alice",
        availableFundsCents: 499,
      });
      const previousState = sessionState(bookingSession);

      // Log & Oracle
      expect(() =>
        alice.asParticipant().join(bookingSession, {
          participationId: "p-alice",
          holdId: "h-alice",
          now: hoursBeforeSessionStart(48),
        }),
      ).toThrow(expect.objectContaining({ code: "INSUFFICIENT_FUNDS" }));

      // Log
      const currentState = sessionState(bookingSession);

      // Oracle
      expect(currentState).toEqual(previousState);
    });

    test("join_WhenPrivateRoomTokenIsMissing_RejectsWithoutChangingState", () => {
      // Input
      const visibilityChangeTime = hoursBeforeSessionStart(48);
      const joinTime = hoursBeforeSessionStart(48);
      const bookingSession = createTestSession();
      readyBooker().changeVisibility(
        bookingSession,
        "PRIVATE",
        visibilityChangeTime,
      );
      const previousState = sessionState(bookingSession);

      // Log & Oracle
      expect(() =>
        createTestUser({ userId: "alice" })
          .asParticipant()
          .join(bookingSession, {
            participationId: "p-alice",
            holdId: "h-alice",
            now: joinTime,
          }),
      ).toThrow(
        expect.objectContaining({
          code: "INVALID_ACCESS",
          message: "The user does not have access to this private session",
        }),
      );

      // Log
      const currentState = sessionState(bookingSession);

      // Oracle
      expect(currentState).toEqual(previousState);
    });

    test("join_WhenPrivateRoomTokenMatches_CommitsApplicant", () => {
      // Input
      const visibilityChangeTime = hoursBeforeSessionStart(48);
      const joinTime = hoursBeforeSessionStart(48);
      const bookingSession = createTestSession();
      readyBooker().changeVisibility(
        bookingSession,
        "PRIVATE",
        visibilityChangeTime,
      );

      // Log
      const admission = createTestUser({ userId: "alice" })
        .asParticipant()
        .join(bookingSession, {
          participationId: "p-alice",
          holdId: "h-alice",
          now: joinTime,
          roomToken: "room",
        });

      // Oracle
      expect(admission.kind).toBe("COMMITTED");
    });

    test("join_WhenReturningWaiterUsesDifferentId_RejectsWithoutChangingState", () => {
      // Input
      const waitlistDepartureTime = hoursBeforeSessionStart(48);
      const rejoinTime = hoursBeforeSessionStart(48);
      const bookingSession = createTestSession({
        committedUserIds: ["alice", "ben"],
        waitlistedUserIds: ["cara", "dana"],
      });

      createTestUser({ userId: "cara" })
        .asParticipant()
        .leaveWaitlist(bookingSession, {
          participationId: "p-cara",
          now: waitlistDepartureTime,
        });
      const previousState = sessionState(bookingSession);

      // Log & Oracle
      expect(() =>
        createTestUser({ userId: "cara" })
          .asParticipant()
          .join(bookingSession, {
            participationId: "different",
            holdId: "h-cara",
            now: rejoinTime,
          }),
      ).toThrow(expect.objectContaining({ code: "DUPLICATE_ID" }));

      // Log
      const currentState = sessionState(bookingSession);

      // Oracle
      expect(currentState).toEqual(previousState);
    });

    test("join_WhenReturningWaiterReusesId_AssignsFreshQueuePosition", () => {
      // Input
      const waitlistDepartureTime = hoursBeforeSessionStart(48);
      const rejoinTime = hoursBeforeSessionStart(48);
      const bookingSession = createTestSession({
        committedUserIds: ["alice", "ben"],
        waitlistedUserIds: ["cara", "dana"],
      });

      createTestUser({ userId: "cara" })
        .asParticipant()
        .leaveWaitlist(bookingSession, {
          participationId: "p-cara",
          now: waitlistDepartureTime,
        });
      const previousList = bookingSession.participantList;
      const departedCara = previousList.requireParticipation("p-cara");

      // Log
      const reentry = createTestUser({ userId: "cara" })
        .asParticipant()
        .join(bookingSession, {
          participationId: "p-cara",
          holdId: "h-cara",
          now: rejoinTime,
        });
      const nextWaiter = bookingSession.participantList.nextWaitlisted();
      const participations = bookingSession.participantList.participations;
      const nextQueueSequence =
        bookingSession.participantList.nextQueueSequence;
      const caraParticipation =
        bookingSession.participantList.requireParticipation("p-cara");
      const participantList = bookingSession.participantList;
      const originalCara = previousList.findByUserId("cara");
      const departedCaraStatus = departedCara.status;
      const departedCaraQueueSequence = departedCara.queueSequence;
      const originalNextQueueSequence = previousList.nextQueueSequence;
      const originalCommittedCount = previousList.committedCount;

      // Oracle
      expect(reentry.kind).toBe("WAITLISTED");
      expect(nextWaiter?.userId).toBe("dana");
      expect(
        participations.filter(
          (participation) => participation.userId === "cara",
        ),
      ).toHaveLength(1);
      expect(
        participations.map((participation) => participation.userId),
      ).toEqual(["alice", "ben", "cara", "dana"]);
      expect(nextQueueSequence).toBe(4);
      expect(caraParticipation.queueSequence).toBe(3);
      expect(participantList).not.toBe(previousList);
      expect(originalCara).toBe(departedCara);
      expect(departedCaraStatus).toBe("LEFT_WAITLIST");
      expect(departedCaraQueueSequence).toBe(1);
      expect(originalNextQueueSequence).toBe(3);
      expect(originalCommittedCount).toBe(2);
    });

    test("join_WhenUserIsAlreadyCommitted_RejectsWithoutChangingState", () => {
      // Input
      const bookingSession = createTestSession({ committedUserIds: ["alice"] });

      const previousState = sessionState(bookingSession);

      // Log & Oracle
      expect(() =>
        createTestUser({ userId: "alice" })
          .asParticipant()
          .join(bookingSession, {
            participationId: "p-alice",
            holdId: "h-alice",
            now: hoursBeforeSessionStart(48),
          }),
      ).toThrow(expect.objectContaining({ code: "ALREADY_PARTICIPATING" }));

      // Log
      const currentState = sessionState(bookingSession);

      // Oracle
      expect(currentState).toEqual(previousState);
    });

    test("join_WhenUserPreviouslyWithdrew_RejectsWithoutChangingState", () => {
      // Input
      const withdrawalTime = hoursBeforeSessionStart(48);
      const rejoinTime = hoursBeforeSessionStart(48);
      const bookingSession = createTestSession({ committedUserIds: ["alice"] });

      createTestUser({ userId: "alice" })
        .asParticipant()
        .withdraw(bookingSession, {
          participationId: "p-alice",
          now: withdrawalTime,
        });
      const previousState = sessionState(bookingSession);

      // Log & Oracle
      expect(() =>
        createTestUser({ userId: "alice" })
          .asParticipant()
          .join(bookingSession, {
            participationId: "p-alice",
            holdId: "h-alice",
            now: rejoinTime,
          }),
      ).toThrow(expect.objectContaining({ code: "REJOIN_NOT_ALLOWED" }));

      // Log
      const currentState = sessionState(bookingSession);

      // Oracle
      expect(currentState).toEqual(previousState);
    });

    test("join_WhenSessionStartsNow_RejectsWithoutChangingState", () => {
      // Input
      const bookingSession = createTestSession();

      const previousState = sessionState(bookingSession);

      // Log & Oracle
      expect(() =>
        createTestUser({ userId: "ben" }).asParticipant().join(bookingSession, {
          participationId: "p-ben",
          holdId: "h-ben",
          now: sessionStartsAt,
        }),
      ).toThrow(expect.objectContaining({ code: "SESSION_STARTED" }));

      // Log
      const currentState = sessionState(bookingSession);

      // Oracle
      expect(currentState).toEqual(previousState);
    });
  });
  describe("Replacement admission", () => {
    test("acceptReplacement_WhenNamedInviteeAcceptsNewerPrivateInvitation_RefundsOnlyTheirInviter", () => {
      // Input
      const visibilityChangeTime = hoursBeforeSessionStart(48);
      const benJoinTime = hoursBeforeSessionStart(48);
      const aliceWithdrawalTime = hoursBeforeSessionStart(20);
      const benWithdrawalTime = hoursBeforeSessionStart(19);
      const acceptanceTime = hoursBeforeSessionStart(18);
      const bookingSession = createTestSession({
        committedUserIds: ["alice"],
      });
      readyBooker().changeVisibility(
        bookingSession,
        "PRIVATE",
        visibilityChangeTime,
      );
      createTestUser({ userId: "ben" }).asParticipant().join(bookingSession, {
        participationId: "p-ben",
        holdId: "h-ben",
        roomToken: "room",
        now: benJoinTime,
      });

      createTestUser({ userId: "alice" })
        .asParticipant()
        .withdraw(bookingSession, {
          participationId: "p-alice",
          now: aliceWithdrawalTime,
          replacementMode: "DIRECT_INVITE",
          replacementInviteeId: "donna",
        });
      createTestUser({ userId: "ben" })
        .asParticipant()
        .withdraw(bookingSession, {
          participationId: "p-ben",
          now: benWithdrawalTime,
          replacementMode: "DIRECT_INVITE",
          replacementInviteeId: "cara",
        });
      // Log
      const replacement = createTestUser({ userId: "cara" })
        .asParticipant()
        .acceptReplacement(bookingSession, {
          participationId: "p-cara",
          holdId: "h-cara",
          now: acceptanceTime,
        });
      const aliceParticipation =
        bookingSession.participantList.findByUserId("alice");
      const caraParticipation =
        bookingSession.participantList.findByUserId("cara");
      const availableSlots = bookingSession.getAvailableSlots(acceptanceTime);

      // Oracle
      expect(replacement.refundedParticipationId).toBe("p-ben");
      expect(replacement.instructions.map((i) => i.kind)).toEqual([
        "LOCK",
        "REFUND",
      ]);
      expect(aliceParticipation?.hold?.state).toBe("AWAITING_REPLACEMENT");
      expect(caraParticipation?.replacesParticipationId).toBe("p-ben");
      expect(availableSlots).toBe(0);
    });

    test("acceptReplacement_WhenInvitationWasAcceptedAndOrdinarySlotIsAvailable_RejectsWithoutChangingState", () => {
      // Input
      const withdrawalTime = hoursBeforeSessionStart(10);
      const acceptanceTime = hoursBeforeSessionStart(9);
      const repeatAcceptanceTime = hoursBeforeSessionStart(8);
      const bookingSession = createTestSession({ committedUserIds: ["ben"] });

      createTestUser({ userId: "ben" })
        .asParticipant()
        .withdraw(bookingSession, {
          participationId: "p-ben",
          now: withdrawalTime,
          replacementMode: "DIRECT_INVITE",
          replacementInviteeId: "cara",
        });
      const replacement = createTestUser({ userId: "cara" })
        .asParticipant()
        .acceptReplacement(bookingSession, {
          participationId: "p-cara",
          holdId: "h-cara",
          now: acceptanceTime,
        });
      expect(replacement.kind).toBe("COMMITTED");
      expect(replacement.refundedParticipationId).toBe("p-ben");
      expect(bookingSession.getAvailableSlots(repeatAcceptanceTime)).toBe(1);
      const previousState = sessionState(bookingSession);

      // Log & Oracle
      expect(() =>
        createTestUser({ userId: "cara" })
          .asParticipant()
          .acceptReplacement(bookingSession, {
            participationId: "p-cara",
            holdId: "h-another",
            now: repeatAcceptanceTime,
          }),
      ).toThrow(expect.objectContaining({ code: "INVALID_ACCESS" }));

      // Log
      const currentState = sessionState(bookingSession);

      // Oracle
      expect(currentState).toEqual(previousState);
    });

    test("acceptReplacement_WhenInvitationWasAcceptedAndSessionIsFull_RejectsWithoutWaitlisting", () => {
      // Input
      const withdrawalTime = hoursBeforeSessionStart(10);
      const acceptanceTime = hoursBeforeSessionStart(9);
      const ordinaryJoinTime = hoursBeforeSessionStart(8);
      const repeatAcceptanceTime = hoursBeforeSessionStart(7);
      const bookingSession = createTestSession({ committedUserIds: ["ben"] });

      createTestUser({ userId: "ben" })
        .asParticipant()
        .withdraw(bookingSession, {
          participationId: "p-ben",
          now: withdrawalTime,
          replacementMode: "DIRECT_INVITE",
          replacementInviteeId: "cara",
        });
      createTestUser({ userId: "cara" })
        .asParticipant()
        .acceptReplacement(bookingSession, {
          participationId: "p-cara",
          holdId: "h-cara",
          now: acceptanceTime,
        });
      createTestUser({ userId: "dana" }).asParticipant().join(bookingSession, {
        participationId: "p-dana",
        holdId: "h-dana",
        now: ordinaryJoinTime,
      });
      expect(bookingSession.getAvailableSlots(repeatAcceptanceTime)).toBe(0);
      const previousState = sessionState(bookingSession);

      // Log & Oracle
      expect(() =>
        createTestUser({ userId: "cara" })
          .asParticipant()
          .acceptReplacement(bookingSession, {
            participationId: "p-cara",
            holdId: "h-another",
            now: repeatAcceptanceTime,
          }),
      ).toThrow(expect.objectContaining({ code: "INVALID_ACCESS" }));

      // Log
      const currentState = sessionState(bookingSession);

      // Oracle
      expect(currentState).toEqual(previousState);
    });

    test("join_WhenParticipantWasRemoved_RejectsWithoutChangingState", () => {
      // Input
      const removalTime = hoursBeforeSessionStart(48);
      const rejoinTime = hoursBeforeSessionStart(48);
      const bookingSession = createTestSession({ committedUserIds: ["alice"] });

      readyBooker().removeParticipant(bookingSession, "p-alice", removalTime);
      const previousState = sessionState(bookingSession);

      // Log & Oracle
      expect(() =>
        createTestUser({ userId: "alice" })
          .asParticipant()
          .join(bookingSession, {
            participationId: "p-alice",
            holdId: "h-alice",
            now: rejoinTime,
          }),
      ).toThrow(expect.objectContaining({ code: "REJOIN_NOT_ALLOWED" }));

      // Log
      const currentState = sessionState(bookingSession);

      // Oracle
      expect(currentState).toEqual(previousState);
    });
  });
});
