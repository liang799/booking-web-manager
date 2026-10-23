import {
  DomainError,
  Money,
  PayoutAttempt,
  type PayoutAttemptDetails,
  type PayoutBatch,
} from "@/domain";
import { describe, expect, test } from "vitest";

const requestedAt = new Date("2026-10-10T12:00:00Z");

describe("PayoutAttempt", () => {
  describe("Construction and isolation", () => {
    test("constructor_WhenCompletionMetadataIsMissing_ThrowsDomainError", () => {
      // Input
      const details = payoutDetails({ status: "COMPLETED" });

      // Log & Oracle
      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });

    test("constructor_WhenCompletedProviderReferenceIsBlank_ThrowsDomainError", () => {
      // Input
      const details = payoutDetails({
        status: "COMPLETED",
        completedAt: requestedAt,
        providerReference: " ",
      });

      // Log & Oracle
      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });

    test("constructor_WhenFailureReasonIsMissing_ThrowsDomainError", () => {
      // Input
      const details = payoutDetails({ status: "FAILED", failedAt: requestedAt });

      // Log & Oracle
      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });

    test("constructor_WhenFailedPayoutHasCompletionDate_ThrowsDomainError", () => {
      // Input
      const details = payoutDetails({
        status: "FAILED",
        failedAt: requestedAt,
        failureReason: "failure",
        completedAt: requestedAt,
      });

      // Log & Oracle
      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });

    test("constructor_WhenRequestedPayoutHasCompletionDate_ThrowsDomainError", () => {
      // Input
      const details = payoutDetails({ completedAt: requestedAt });

      // Log & Oracle
      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });

    test("constructor_WhenRequestedPayoutHasProviderReference_ThrowsDomainError", () => {
      // Input
      const details = payoutDetails({ providerReference: "provider" });

      // Log & Oracle
      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });

    test("constructor_WhenAmountDoesNotMatchLines_ThrowsDomainError", () => {
      // Input
      const details = payoutDetails({ amount: Money.fromCents(99) });

      // Log & Oracle
      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });

    test("constructor_WhenAccountDoesNotMatchDestination_ThrowsDomainError", () => {
      // Input
      const details = payoutDetails({ payoutAccountId: "foreign" });

      // Log & Oracle
      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });

    test("constructor_WhenLinesAreEmpty_ThrowsDomainError", () => {
      // Input
      const details = payoutDetails({ lines: [] });

      // Log & Oracle
      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });

    test("constructor_WhenLinesAreDuplicated_ThrowsDomainError", () => {
      // Input
      const source = batch();
      const details = payoutDetails({ lines: [...source.lines, ...source.lines] });

      // Log & Oracle
      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });

    test("constructor_WhenNestedInputsAndOutputsAreMutated_PreservesSettlementData", () => {
      // Input
      const source = batch();
      const completedAt = new Date(requestedAt);
      const payout = new PayoutAttempt({
        ...source,
        payoutAccountId: "account",
        amount: Money.fromCents(100),
        status: "COMPLETED",
        completedAt,
        providerReference: "provider",
      });

      // Log
      completedAt.setTime(0);
      payout.completedAt?.setTime(0);
      (
        source.destination as { bankAccountReference: string }
      ).bankAccountReference = "changed";
      (source.lines as unknown[]).pop();
      (
        payout.destination as { bankAccountReference: string }
      ).bankAccountReference = "changed";
      (payout.lines as unknown[]).pop();

      // Oracle
      expect(payout.completedAt).toEqual(requestedAt);
      expect(payout.destination.bankAccountReference).toBe("bank");
      expect(payout.lines).toHaveLength(1);
      expect(payout.lines[0]?.amount.toCents()).toBe(100);
    });

    test("create_WhenRequestDateIsMutated_PreservesRequestedBatch", () => {
      // Input
      const source = batch();
      const payout = PayoutAttempt.create(source);

      // Log
      source.requestedAt.setTime(0);
      payout.requestedAt.setTime(0);

      // Oracle
      expect(payout.amount.toCents()).toBe(100);
      expect(payout.requestedAt).toEqual(requestedAt);
    });
  });

  describe("Request intent", () => {
    test("requestedIntent_WhenPayoutIsRequested_ContainsDurableRequestDetails", () => {
      // Input
      const payout = PayoutAttempt.create(batch());

      // Log
      const intent = payout.requestedIntent();

      // Oracle
      expect(intent).toMatchObject({
        kind: "PAYOUT_REQUESTED",
        payoutId: "payout",
        amount: Money.fromCents(100),
      });
    });
  });

  describe("Completion", () => {
    test("complete_WhenRestoredPayoutHasFailed_ThrowsStalePayout", () => {
      // Input
      const details = payoutDetails({
        status: "FAILED",
        failedAt: requestedAt,
        failureReason: "failure",
      });
      const payout = new PayoutAttempt(details);

      // Log & Oracle
      expect(() => payout.complete("provider", requestedAt)).toThrow(
        expect.objectContaining({ code: "STALE_PAYOUT" }),
      );
    });

    test("complete_WhenSameCallbackIsRepeated_CompletesOnlyOnce", () => {
      // Input
      const payout = PayoutAttempt.create(batch());

      // Log
      const completed = payout.complete("provider-result", requestedAt);
      const repeatedCompletion = payout.complete(
        "provider-result",
        requestedAt,
      );

      // Oracle
      expect(completed).toBe(true);
      expect(repeatedCompletion).toBe(false);
      expect(payout.status).toBe("COMPLETED");
      expect(payout.providerReference).toBe("provider-result");
    });

    test("complete_WhenProviderReferenceConflicts_ThrowsPayoutConflict", () => {
      // Input
      const payout = PayoutAttempt.create(batch());
      payout.complete("provider-result", requestedAt);

      // Log & Oracle
      expect(() => payout.complete("other-result", requestedAt)).toThrow(
        expect.objectContaining({ code: "PAYOUT_CONFLICT" }),
      );
    });

    test("complete_WhenRestoredCompletionMatches_ReturnsFalse", () => {
      // Input
      const payout = new PayoutAttempt({
        ...batch(),
        payoutAccountId: "account",
        amount: Money.fromCents(100),
        status: "COMPLETED",
        completedAt: requestedAt,
        providerReference: "provider-result",
      });

      // Log
      const repeatedCompletion = payout.complete(
        "provider-result",
        requestedAt,
      );

      // Oracle
      expect(payout.status).toBe("COMPLETED");
      expect(payout.amount.toCents()).toBe(100);
      expect(payout.providerReference).toBe("provider-result");
      expect(repeatedCompletion).toBe(false);
    });

    test("complete_WhenFailureHasBeenRecorded_RejectsLateCallback", () => {
      // Input
      const payout = PayoutAttempt.create(batch());
      payout.fail("timeout", requestedAt);

      // Log & Oracle
      expect(() => payout.complete("late", requestedAt)).toThrow(
        expect.objectContaining({ code: "STALE_PAYOUT" }),
      );
    });
  });

  describe("Failure", () => {
    test("fail_WhenRestoredFailureMatches_ReturnsFalse", () => {
      // Input
      const details = payoutDetails({
        status: "FAILED",
        failedAt: requestedAt,
        failureReason: "failure",
      });
      const payout = new PayoutAttempt(details);

      // Log
      const repeatedFailure = payout.fail("failure", requestedAt);

      // Oracle
      expect(repeatedFailure).toBe(false);
      expect(payout.status).toBe("FAILED");
      expect(payout.failureReason).toBe("failure");
    });

    test("fail_WhenSameCallbackIsRepeated_FailsOnlyOnce", () => {
      // Input
      const payout = PayoutAttempt.create(batch());

      // Log
      const failed = payout.fail("timeout", requestedAt);
      const repeatedFailure = payout.fail("timeout", requestedAt);

      // Oracle
      expect(failed).toBe(true);
      expect(repeatedFailure).toBe(false);
      expect(payout.status).toBe("FAILED");
      expect(payout.failureReason).toBe("timeout");
    });
  });
});

function payoutDetails(
  overrides: Partial<PayoutAttemptDetails> = {},
): PayoutAttemptDetails {
  return {
    ...batch(),
    payoutAccountId: "account",
    amount: Money.fromCents(100),
    status: "REQUESTED",
    ...overrides,
  };
}

function batch(): PayoutBatch {
  return {
    payoutId: "payout",
    sessionId: "session",
    idempotencyKey: "key",
    requestedAt: new Date(requestedAt),
    destination: {
      payoutAccountId: "account",
      userId: "booker",
      providerAccountReference: "provider",
      bankAccountReference: "bank",
    },
    lines: [
      {
        holdId: "hold",
        participationId: "participation",
        holdingAccountId: "platform",
        walletId: "wallet",
        amount: Money.fromCents(100),
        kind: "RELEASE",
      },
    ],
  };
}
