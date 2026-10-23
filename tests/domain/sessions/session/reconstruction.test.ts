import { DomainError, FundHold, Participation, Session } from "@/domain";
import { describe, expect, test } from "vitest";
import {
  hoursBeforeSessionStart,
  sessionEndsAt,
  pendingPayoutDetails,
  createTestSession,
  readyBooker,
  sessionDetails,
  sessionStartsAt,
} from "./session-fixtures";

describe("Session", () => {
  describe("Construction and isolation", () => {
    test("constructor_WhenInputsAndGettersAreMutated_PreservesRosterAndHistory", () => {
      const committedAt = hoursBeforeSessionStart(48);
      const originalSession = createTestSession({
        committedUserIds: ["alice"],
      });
      const participations = [
        ...originalSession.participantList.participations,
      ];
      const payoutAttemptIds = ["earlier"];
      const payoutIdempotencyKeys = ["earlier-key"];
      const aliceParticipation = participations[0]!;
      const details = sessionDetails({
        participations,
        payoutAttemptIds,
        payoutIdempotencyKeys,
      });

      const restoredSession = new Session(details);
      participations.pop();
      payoutAttemptIds.push("leak");
      payoutIdempotencyKeys.push("leak");
      (restoredSession.participantList.participations as Participation[]).pop();
      (restoredSession.payoutAttemptIds as string[]).pop();
      (restoredSession.payoutIdempotencyKeys as string[]).pop();
      restoredSession.booking.startAt.setFullYear(2000);
      aliceParticipation.committedAt?.setFullYear(2000);
      aliceParticipation.hold?.createdAt.setFullYear(2000);

      expect(restoredSession.participantList.participations).toHaveLength(1);
      expect(
        restoredSession.participantList.requireParticipation("p-alice"),
      ).toBe(aliceParticipation);
      expect(restoredSession.booking.startAt).toEqual(sessionStartsAt);
      expect(aliceParticipation.committedAt).toEqual(committedAt);
      expect(aliceParticipation.hold?.createdAt).toEqual(committedAt);
      expect(restoredSession.payoutAttemptIds).toEqual(["earlier"]);
      expect(restoredSession.payoutIdempotencyKeys).toEqual(["earlier-key"]);
      expect(restoredSession.participantList.nextQueueSequence).toBe(1);
    });

    test("constructor_WhenBothHistoriesAreOmittedWithoutPendingPayout_ThrowsInvalidInput", () => {
      const details = {
        ...sessionDetails(),
        payoutAttemptIds: undefined,
        payoutIdempotencyKeys: undefined,
      };

      expect(() => {
        // @ts-expect-error Verify omitted histories fail at the runtime construction boundary.
        return new Session(details);
      }).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("constructor_WhenAttemptHistoryIsOmittedWithoutPendingPayout_ThrowsInvalidInput", () => {
      const details = {
        ...sessionDetails(),
        payoutAttemptIds: undefined,
        payoutIdempotencyKeys: ["earlier-key"],
      };

      expect(() => {
        // @ts-expect-error Verify omitted attempt history fails at the runtime construction boundary.
        return new Session(details);
      }).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("constructor_WhenKeyHistoryIsOmittedWithoutPendingPayout_ThrowsInvalidInput", () => {
      const details = {
        ...sessionDetails(),
        payoutAttemptIds: ["earlier"],
        payoutIdempotencyKeys: undefined,
      };

      expect(() => {
        // @ts-expect-error Verify omitted key history fails at the runtime construction boundary.
        return new Session(details);
      }).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("constructor_WhenAttemptHistoryIsNotAnArray_ThrowsInvalidInput", () => {
      const details = { ...sessionDetails(), payoutAttemptIds: "earlier" };

      expect(() => {
        // @ts-expect-error Verify the required history collection is rejected before Set conversion.
        return new Session(details);
      }).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("constructor_WhenKeyHistoryIsNotAnArray_ThrowsInvalidInput", () => {
      const details = {
        ...sessionDetails(),
        payoutIdempotencyKeys: "earlier-key",
      };

      expect(() => {
        // @ts-expect-error Verify the required history collection is rejected before Set conversion.
        return new Session(details);
      }).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("constructor_WhenBothHistoriesAreOmittedWithPendingPayout_ThrowsInvalidInput", () => {
      const details = {
        ...pendingPayoutDetails(),
        payoutAttemptIds: undefined,
        payoutIdempotencyKeys: undefined,
      };

      expect(() => {
        // @ts-expect-error A pending batch must not fill omitted histories at runtime.
        return new Session(details);
      }).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("constructor_WhenAttemptHistoryIsOmittedWithPendingPayout_ThrowsInvalidInput", () => {
      const details = {
        ...pendingPayoutDetails(),
        payoutAttemptIds: undefined,
        payoutIdempotencyKeys: ["earlier-key", "key"],
      };

      expect(() => {
        // @ts-expect-error A pending batch must not fill omitted attempt history at runtime.
        return new Session(details);
      }).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("constructor_WhenKeyHistoryIsOmittedWithPendingPayout_ThrowsInvalidInput", () => {
      const details = {
        ...pendingPayoutDetails(),
        payoutAttemptIds: ["earlier", "out"],
        payoutIdempotencyKeys: undefined,
      };

      expect(() => {
        // @ts-expect-error A pending batch must not fill omitted key history at runtime.
        return new Session(details);
      }).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("constructor_WhenCancelledRosterHasRemovedParticipant_PreservesRemovedStatus", () => {
      const cancelledSession = createTestSession({
        committedUserIds: ["alice", "ben"],
        waitlistedUserIds: ["cara"],
      });
      const booker = readyBooker();
      booker.removeParticipant(
        cancelledSession,
        "p-alice",
        hoursBeforeSessionStart(48),
      );
      booker.cancel(cancelledSession, hoursBeforeSessionStart(24));
      const details = sessionDetails({
        status: "CANCELLED",
        participations: cancelledSession.participantList.participations,
        nextQueueSequence: cancelledSession.participantList.nextQueueSequence,
      });

      const restoredSession = new Session(details);

      expect(
        restoredSession.participantList.requireParticipation("p-alice").status,
      ).toBe("REMOVED");
    });

    test("constructor_WhenSessionIsSettled_RestoresStatusAndEndTime", () => {
      const details = sessionDetails({ status: "SETTLED" });

      const restoredSession = new Session(details);

      expect(restoredSession.status).toBe("SETTLED");
      expect(restoredSession.booking.endAt).toEqual(sessionEndsAt);
    });

    test("constructor_WhenFailedPayoutHistoryIsRestored_PreservesAttemptsAndKeys", () => {
      const details = {
        ...pendingPayoutDetails(),
        status: "AWAITING_PAYOUT" as const,
        pendingSettlement: undefined,
      };

      const restoredSession = new Session(details);

      expect(restoredSession.status).toBe("AWAITING_PAYOUT");
      expect(restoredSession.pendingSettlement).toBeUndefined();
      expect(restoredSession.payoutAttemptIds).toEqual(["out"]);
      expect(restoredSession.payoutIdempotencyKeys).toEqual(["key"]);
      expect(restoredSession.participantList
        .requireParticipation("p-alice").hold?.state).toBe("HELD");
    });

    test("constructor_WhenRosterIsDuplicated_ThrowsDomainError", () => {
      const originalSession = createTestSession({
        committedUserIds: ["alice"],
      });
      const roster = originalSession.participantList.participations;
      const details = sessionDetails({
        participations: [...roster, ...roster],
      });

      expect(() => new Session(details)).toThrow(DomainError);
    });

    test("constructor_WhenDifferentUsersShareParticipationId_ThrowsDuplicateId", () => {
      const waitlistedAt = hoursBeforeSessionStart(48);
      const alice = Participation.createWaitlisted({
        participationId: "p-shared",
        userId: "alice",
        waitlistedAt,
        queueSequence: 1,
      });
      const ben = Participation.createWaitlisted({
        participationId: "p-shared",
        userId: "ben",
        waitlistedAt,
        queueSequence: 2,
      });
      const details = sessionDetails({
        participations: [alice, ben],
        nextQueueSequence: 3,
      });

      expect(() => new Session(details)).toThrow(
        expect.objectContaining({ code: "DUPLICATE_ID" }),
      );
    });

    test("constructor_WhenDifferentParticipationsShareUserId_ThrowsDuplicateId", () => {
      const waitlistedAt = hoursBeforeSessionStart(48);
      const firstEntry = Participation.createWaitlisted({
        participationId: "p-alice-first",
        userId: "alice",
        waitlistedAt,
        queueSequence: 1,
      });
      const secondEntry = Participation.createWaitlisted({
        participationId: "p-alice-second",
        userId: "alice",
        waitlistedAt,
        queueSequence: 2,
      });
      const details = sessionDetails({
        participations: [firstEntry, secondEntry],
        nextQueueSequence: 3,
      });

      expect(() => new Session(details)).toThrow(
        expect.objectContaining({ code: "DUPLICATE_ID" }),
      );
    });

    test("constructor_WhenDifferentParticipationsShareHoldId_ThrowsDuplicateId", () => {
      const benCommittedAt = hoursBeforeSessionStart(48);
      const originalSession = createTestSession({
        committedUserIds: ["alice"],
      });
      const alice =
        originalSession.participantList.requireParticipation("p-alice");
      const ben = Participation.createCommitted({
        participationId: "p-ben",
        userId: "ben",
        committedAt: benCommittedAt,
        hold: FundHold.create({
          holdId: "h-alice",
          participationId: "p-ben",
          holdingAccountId: originalSession.holdingAccountId,
          walletId: "w-ben",
          amount: originalSession.bookingShare,
          createdAt: benCommittedAt,
        }),
      });
      const details = sessionDetails({ participations: [alice, ben] });

      expect(() => new Session(details)).toThrow(
        expect.objectContaining({ code: "DUPLICATE_ID" }),
      );
    });

    test("constructor_WhenWaiterReusesHistoricalQueueSequence_ThrowsDuplicateId", () => {
      const waitlistedAt = hoursBeforeSessionStart(48);
      const departedAlice = Participation.createWaitlisted({
        participationId: "p-alice",
        userId: "alice",
        waitlistedAt,
        queueSequence: 1,
      }).leaveWaitlist();
      const ben = Participation.createWaitlisted({
        participationId: "p-ben",
        userId: "ben",
        waitlistedAt,
        queueSequence: 1,
      });
      const details = sessionDetails({
        participations: [departedAlice, ben],
        nextQueueSequence: 2,
      });

      expect(() => new Session(details)).toThrow(
        expect.objectContaining({ code: "DUPLICATE_ID" }),
      );
    });

    test("constructor_WhenPendingPayoutHasNoBatch_ThrowsDomainError", () => {
      const details = sessionDetails({ status: "PAYOUT_PENDING" });

      expect(() => new Session(details)).toThrow(DomainError);
    });

    test("constructor_WhenNextSequenceDoesNotFollowQueue_ThrowsDomainError", () => {
      const queued = Participation.createWaitlisted({
        participationId: "queued",
        userId: "queued-user",
        waitlistedAt: hoursBeforeSessionStart(48),
        queueSequence: 5,
      });
      const details = sessionDetails({
        participations: [queued],
        nextQueueSequence: 5,
      });

      expect(() => new Session(details)).toThrow(DomainError);
    });

    test("constructor_WhenSettledRosterStillHasHeldFunds_ThrowsDomainError", () => {
      const originalSession = createTestSession({
        committedUserIds: ["alice"],
      });
      const roster = originalSession.participantList.participations;
      const details = sessionDetails({
        participations: roster,
        status: "SETTLED",
      });

      expect(() => new Session(details)).toThrow(DomainError);
    });

    test("constructor_WhenHoldUsesForeignAccount_ThrowsDomainError", () => {
      const originalSession = createTestSession({
        committedUserIds: ["alice"],
      });
      const roster = originalSession.participantList.participations;
      const details = sessionDetails({
        participations: roster,
        holdingAccountId: "foreign",
      });

      expect(() => new Session(details)).toThrow(DomainError);
    });

    test("constructor_WhenPayoutAttemptIdsAreDuplicated_ThrowsDomainError", () => {
      const details = sessionDetails({ payoutAttemptIds: ["same", "same"] });

      expect(() => new Session(details)).toThrow(DomainError);
    });

    test("constructor_WhenPayoutKeysAreDuplicated_ThrowsDomainError", () => {
      const details = sessionDetails({
        payoutIdempotencyKeys: ["same", "same"],
      });

      expect(() => new Session(details)).toThrow(DomainError);
    });

    test("constructor_WhenNextSequenceFollowsQueue_RestoresNextWaiter", () => {
      const queued = Participation.createWaitlisted({
        participationId: "queued",
        userId: "queued-user",
        waitlistedAt: hoursBeforeSessionStart(48),
        queueSequence: 5,
      });
      const details = sessionDetails({
        participations: [queued],
        nextQueueSequence: 6,
      });

      const restoredSession = new Session(details);

      expect(
        restoredSession.participantList.nextWaitlisted()?.userId,
      ).toBe("queued-user");
    });

    test("constructor_WhenPendingBatchBelongsToAnotherSession_ThrowsDomainError", () => {
      const details = pendingPayoutDetails();
      const batch = details.pendingSettlement!;

      expect(
        () =>
          new Session({
            ...details,
            pendingSettlement: { ...batch, sessionId: "foreign" },
          }),
      ).toThrow(DomainError);
    });

    test("constructor_WhenPendingLineUsesForeignWallet_ThrowsDomainError", () => {
      const details = pendingPayoutDetails();
      const batch = details.pendingSettlement!;

      expect(
        () =>
          new Session({
            ...details,
            pendingSettlement: {
              ...batch,
              lines: [{ ...batch.lines[0]!, walletId: "foreign" }],
            },
          }),
      ).toThrow(DomainError);
    });

    test("constructor_WhenPendingAttemptIsMissingFromHistory_ThrowsDomainError", () => {
      const details = pendingPayoutDetails();

      expect(() => new Session({ ...details, payoutAttemptIds: [] })).toThrow(
        DomainError,
      );
    });

    test("constructor_WhenPendingKeyIsMissingFromHistory_ThrowsDomainError", () => {
      const details = pendingPayoutDetails();

      expect(
        () => new Session({ ...details, payoutIdempotencyKeys: [] }),
      ).toThrow(DomainError);
    });

    test("pendingSettlement_WhenInputsAndOutputsAreMutated_PreservesBatchAndHistory", () => {
      const details = pendingPayoutDetails();
      const batch = details.pendingSettlement!;
      const restoredSession = new Session(details);

      batch.requestedAt.setFullYear(2000);
      (
        batch.destination as { bankAccountReference: string }
      ).bankAccountReference = "changed";
      (batch.lines as unknown[]).pop();
      restoredSession.pendingSettlement?.requestedAt.setFullYear(2001);
      const exposedBatch = restoredSession.pendingSettlement!;
      (
        exposedBatch.destination as { bankAccountReference: string }
      ).bankAccountReference = "changed-again";
      (exposedBatch.lines as unknown[]).pop();
      const preservedBatch = restoredSession.pendingSettlement;

      expect(preservedBatch?.requestedAt).toEqual(sessionEndsAt);
      expect(preservedBatch?.destination.bankAccountReference).toBe("bank");
      expect(preservedBatch?.lines).toHaveLength(1);
      expect(preservedBatch?.lines[0]?.amount.toCents()).toBe(500);
      expect(restoredSession.payoutAttemptIds).toEqual(["out"]);
      expect(restoredSession.payoutIdempotencyKeys).toEqual(["key"]);
    });
  });

  describe("Settlement completion", () => {
    test("completeSettlement_WhenPendingSessionIsRestored_SettlesIndependentlyOfSource", () => {
      const details = pendingPayoutDetails();
      const originalSession = new Session(details);
      const restoredSession = new Session(details);

      const completion = restoredSession.completeSettlement(
        "out",
        sessionEndsAt,
      );

      expect(completion.instructions.map((line) => line.kind)).toEqual([
        "RELEASE",
      ]);
      expect(restoredSession.status).toBe("SETTLED");
      expect(originalSession.status).toBe("PAYOUT_PENDING");
      expect(
        originalSession.participantList
          .requireParticipation("p-alice").hold?.state,
      ).toBe("HELD");
    });
  });
});
