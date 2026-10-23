import { DomainError, FundHold, Participation, Session } from "@/domain";
import { describe, expect, test } from "vitest";
import {
  hoursBeforeSessionStart,
  sessionEndsAt,
  pendingPayoutDetails,
  createTestSession,
  sessionDetails,
  sessionStartsAt,
} from "./session-fixtures";

describe("Session", () => {
  describe("Construction and isolation", () => {
    test("constructor_WhenInputsAndGettersAreMutated_PreservesRosterAndHistory", () => {
      // Input
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

      // Log
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

      // Oracle
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
      // Input
      const details = {
        ...sessionDetails(),
        payoutAttemptIds: undefined,
        payoutIdempotencyKeys: undefined,
      };

      // Log & Oracle
      expect(() => {
        // @ts-expect-error Verify omitted histories fail at the runtime construction boundary.
        return new Session(details);
      }).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("constructor_WhenAttemptHistoryIsOmittedWithoutPendingPayout_ThrowsInvalidInput", () => {
      // Input
      const details = {
        ...sessionDetails(),
        payoutAttemptIds: undefined,
        payoutIdempotencyKeys: ["earlier-key"],
      };

      // Log & Oracle
      expect(() => {
        // @ts-expect-error Verify omitted attempt history fails at the runtime construction boundary.
        return new Session(details);
      }).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("constructor_WhenKeyHistoryIsOmittedWithoutPendingPayout_ThrowsInvalidInput", () => {
      // Input
      const details = {
        ...sessionDetails(),
        payoutAttemptIds: ["earlier"],
        payoutIdempotencyKeys: undefined,
      };

      // Log & Oracle
      expect(() => {
        // @ts-expect-error Verify omitted key history fails at the runtime construction boundary.
        return new Session(details);
      }).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("constructor_WhenAttemptHistoryIsNotAnArray_ThrowsInvalidInput", () => {
      // Input
      const details = { ...sessionDetails(), payoutAttemptIds: "earlier" };

      // Log & Oracle
      expect(() => {
        // @ts-expect-error Verify the required history collection is rejected before Set conversion.
        return new Session(details);
      }).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("constructor_WhenKeyHistoryIsNotAnArray_ThrowsInvalidInput", () => {
      // Input
      const details = {
        ...sessionDetails(),
        payoutIdempotencyKeys: "earlier-key",
      };

      // Log & Oracle
      expect(() => {
        // @ts-expect-error Verify the required history collection is rejected before Set conversion.
        return new Session(details);
      }).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("constructor_WhenBothHistoriesAreOmittedWithPendingPayout_ThrowsInvalidInput", () => {
      // Input
      const details = {
        ...pendingPayoutDetails(),
        payoutAttemptIds: undefined,
        payoutIdempotencyKeys: undefined,
      };

      // Log & Oracle
      expect(() => {
        // @ts-expect-error A pending batch must not fill omitted histories at runtime.
        return new Session(details);
      }).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("constructor_WhenAttemptHistoryIsOmittedWithPendingPayout_ThrowsInvalidInput", () => {
      // Input
      const details = {
        ...pendingPayoutDetails(),
        payoutAttemptIds: undefined,
        payoutIdempotencyKeys: ["earlier-key", "key"],
      };

      // Log & Oracle
      expect(() => {
        // @ts-expect-error A pending batch must not fill omitted attempt history at runtime.
        return new Session(details);
      }).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("constructor_WhenKeyHistoryIsOmittedWithPendingPayout_ThrowsInvalidInput", () => {
      // Input
      const details = {
        ...pendingPayoutDetails(),
        payoutAttemptIds: ["earlier", "out"],
        payoutIdempotencyKeys: undefined,
      };

      // Log & Oracle
      expect(() => {
        // @ts-expect-error A pending batch must not fill omitted key history at runtime.
        return new Session(details);
      }).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("constructor_WhenSessionIsSettled_RestoresStatusAndEndTime", () => {
      // Input
      const details = sessionDetails({ status: "SETTLED" });

      // Log
      const restoredSession = new Session(details);

      // Oracle
      expect(restoredSession.status).toBe("SETTLED");
      expect(restoredSession.booking.endAt).toEqual(sessionEndsAt);
    });

    test("constructor_WhenFailedPayoutHistoryIsRestored_PreservesAttemptsAndKeys", () => {
      // Input
      const details = {
        ...pendingPayoutDetails(),
        status: "AWAITING_PAYOUT" as const,
        pendingSettlement: undefined,
      };

      // Log
      const restoredSession = new Session(details);

      // Oracle
      expect(restoredSession.status).toBe("AWAITING_PAYOUT");
      expect(restoredSession.pendingSettlement).toBeUndefined();
      expect(restoredSession.payoutAttemptIds).toEqual(["out"]);
      expect(restoredSession.payoutIdempotencyKeys).toEqual(["key"]);
      expect(
        restoredSession.participantList.requireParticipation("p-alice").hold
          ?.state,
      ).toBe("HELD");
    });

    test("constructor_WhenRosterIsDuplicated_ThrowsDomainError", () => {
      // Input
      const originalSession = createTestSession({
        committedUserIds: ["alice"],
      });
      const roster = originalSession.participantList.participations;
      const details = sessionDetails({
        participations: [...roster, ...roster],
      });

      // Log & Oracle
      expect(() => new Session(details)).toThrow(DomainError);
    });

    test("constructor_WhenDifferentUsersShareParticipationId_ThrowsDuplicateId", () => {
      // Input
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

      // Log & Oracle
      expect(() => new Session(details)).toThrow(
        expect.objectContaining({ code: "DUPLICATE_ID" }),
      );
    });

    test("constructor_WhenDifferentParticipationsShareUserId_ThrowsDuplicateId", () => {
      // Input
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

      // Log & Oracle
      expect(() => new Session(details)).toThrow(
        expect.objectContaining({ code: "DUPLICATE_ID" }),
      );
    });

    test("constructor_WhenDifferentParticipationsShareHoldId_ThrowsDuplicateId", () => {
      // Input
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

      // Log & Oracle
      expect(() => new Session(details)).toThrow(
        expect.objectContaining({ code: "DUPLICATE_ID" }),
      );
    });

    test("constructor_WhenWaiterReusesHistoricalQueueSequence_ThrowsDuplicateId", () => {
      // Input
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

      // Log & Oracle
      expect(() => new Session(details)).toThrow(
        expect.objectContaining({ code: "DUPLICATE_ID" }),
      );
    });

    test("constructor_WhenPendingPayoutHasNoBatch_ThrowsDomainError", () => {
      // Input
      const details = sessionDetails({ status: "PAYOUT_PENDING" });

      // Log & Oracle
      expect(() => new Session(details)).toThrow(DomainError);
    });

    test("constructor_WhenNextSequenceDoesNotFollowQueue_ThrowsDomainError", () => {
      // Input
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

      // Log & Oracle
      expect(() => new Session(details)).toThrow(DomainError);
    });

    test("constructor_WhenSettledRosterStillHasHeldFunds_ThrowsDomainError", () => {
      // Input
      const originalSession = createTestSession({
        committedUserIds: ["alice"],
      });
      const roster = originalSession.participantList.participations;
      const details = sessionDetails({
        participations: roster,
        status: "SETTLED",
      });

      // Log & Oracle
      expect(() => new Session(details)).toThrow(DomainError);
    });

    test("constructor_WhenHoldUsesForeignAccount_ThrowsDomainError", () => {
      // Input
      const originalSession = createTestSession({
        committedUserIds: ["alice"],
      });
      const roster = originalSession.participantList.participations;
      const details = sessionDetails({
        participations: roster,
        holdingAccountId: "foreign",
      });

      // Log & Oracle
      expect(() => new Session(details)).toThrow(DomainError);
    });

    test("constructor_WhenPayoutAttemptIdsAreDuplicated_ThrowsDomainError", () => {
      // Input
      const details = sessionDetails({ payoutAttemptIds: ["same", "same"] });

      // Log & Oracle
      expect(() => new Session(details)).toThrow(DomainError);
    });

    test("constructor_WhenPayoutKeysAreDuplicated_ThrowsDomainError", () => {
      // Input
      const details = sessionDetails({
        payoutIdempotencyKeys: ["same", "same"],
      });

      // Log & Oracle
      expect(() => new Session(details)).toThrow(DomainError);
    });

    test("constructor_WhenNextSequenceFollowsQueue_RestoresNextWaiter", () => {
      // Input
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

      // Log
      const restoredSession = new Session(details);

      // Oracle
      expect(restoredSession.participantList.nextWaitlisted()?.userId).toBe(
        "queued-user",
      );
    });

    test("constructor_WhenPendingBatchBelongsToAnotherSession_ThrowsDomainError", () => {
      // Input
      const details = pendingPayoutDetails();
      const batch = details.pendingSettlement!;

      // Log & Oracle
      expect(
        () =>
          new Session({
            ...details,
            pendingSettlement: { ...batch, sessionId: "foreign" },
          }),
      ).toThrow(DomainError);
    });

    test("constructor_WhenPendingLineUsesForeignWallet_ThrowsDomainError", () => {
      // Input
      const details = pendingPayoutDetails();
      const batch = details.pendingSettlement!;

      // Log & Oracle
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
      // Input
      const details = pendingPayoutDetails();

      // Log & Oracle
      expect(() => new Session({ ...details, payoutAttemptIds: [] })).toThrow(
        DomainError,
      );
    });

    test("constructor_WhenPendingKeyIsMissingFromHistory_ThrowsDomainError", () => {
      // Input
      const details = pendingPayoutDetails();

      // Log & Oracle
      expect(
        () => new Session({ ...details, payoutIdempotencyKeys: [] }),
      ).toThrow(DomainError);
    });

    test("pendingSettlement_WhenInputsAndOutputsAreMutated_PreservesBatchAndHistory", () => {
      // Input
      const details = pendingPayoutDetails();
      const batch = details.pendingSettlement!;
      const restoredSession = new Session(details);

      // Log
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

      // Oracle
      expect(restoredSession.pendingSettlement?.requestedAt).toEqual(
        sessionEndsAt,
      );
      expect(
        restoredSession.pendingSettlement?.destination.bankAccountReference,
      ).toBe("bank");
      expect(restoredSession.pendingSettlement?.lines).toHaveLength(1);
      expect(
        restoredSession.pendingSettlement?.lines[0]?.amount.toCents(),
      ).toBe(500);
      expect(restoredSession.payoutAttemptIds).toEqual(["out"]);
      expect(restoredSession.payoutIdempotencyKeys).toEqual(["key"]);
    });
  });

  describe("Settlement completion", () => {
    test("completeSettlement_WhenPendingSessionIsRestored_SettlesIndependentlyOfSource", () => {
      // Input
      const details = pendingPayoutDetails();
      const originalSession = new Session(details);
      const restoredSession = new Session(details);

      // Log
      const completion = restoredSession.completeSettlement(
        "out",
        sessionEndsAt,
      );

      // Oracle
      expect(completion.instructions.map((line) => line.kind)).toEqual([
        "RELEASE",
      ]);
      expect(restoredSession.status).toBe("SETTLED");
      expect(originalSession.status).toBe("PAYOUT_PENDING");
      expect(
        originalSession.participantList.requireParticipation("p-alice").hold
          ?.state,
      ).toBe("HELD");
    });
  });
});
