import {
  DomainError,
  Money,
  PayoutAttempt,
  type PayoutAttemptDetails,
  type PayoutBatch,
} from "@/domain";
import { describe, expect, test } from "vitest";

const requestedAt = new Date("2026-10-10T12:00:00Z");

describe("Payout request and provider outcome handling", () => {
  describe("Restoring provider outcomes", () => {
    test("constructor_WhenCompletionMetadataIsMissing_ThrowsDomainError", () => {
      const details = payoutDetails({ status: "COMPLETED" });

      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });

    test("constructor_WhenCompletedProviderReferenceIsBlank_ThrowsDomainError", () => {
      const details = payoutDetails({
        status: "COMPLETED",
        completedAt: requestedAt,
        providerReference: " ",
      });

      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });

    test("constructor_WhenFailureReasonIsMissing_ThrowsDomainError", () => {
      const details = payoutDetails({ status: "FAILED", failedAt: requestedAt });

      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });

    test("constructor_WhenFailedPayoutHasCompletionDate_ThrowsDomainError", () => {
      const details = payoutDetails({
        status: "FAILED",
        failedAt: requestedAt,
        failureReason: "failure",
        completedAt: requestedAt,
      });

      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });

    test("constructor_WhenRequestedPayoutHasCompletionDate_ThrowsDomainError", () => {
      const details = payoutDetails({ completedAt: requestedAt });

      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });

    test("constructor_WhenRequestedPayoutHasProviderReference_ThrowsDomainError", () => {
      const details = payoutDetails({ providerReference: "provider" });

      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });
  });

  describe("Settlement batch integrity", () => {
    test("constructor_WhenAmountDoesNotMatchLines_ThrowsDomainError", () => {
      const details = payoutDetails({ amount: Money.fromCents(99) });

      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });

    test("constructor_WhenAccountDoesNotMatchDestination_ThrowsDomainError", () => {
      const details = payoutDetails({ payoutAccountId: "foreign" });

      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });

    test("constructor_WhenLinesAreEmpty_ThrowsDomainError", () => {
      const details = payoutDetails({ lines: [] });

      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });

    test("constructor_WhenLinesAreDuplicated_ThrowsDomainError", () => {
      const source = batch();
      const details = payoutDetails({ lines: [...source.lines, ...source.lines] });

      expect(() => new PayoutAttempt(details)).toThrow(DomainError);
    });
  });

  describe("Durable request and settlement data", () => {
    test("constructor_WhenNestedInputsAndOutputsAreMutated_PreservesSettlementData", () => {
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

      // Attempt to alter supplied and returned settlement data.
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
      const lines = payout.lines;

      expect(payout.completedAt).toEqual(requestedAt);
      expect(payout.destination.bankAccountReference).toBe("bank");
      expect(lines).toHaveLength(1);
      expect(lines[0]?.amount.toCents()).toBe(100);
    });

    test("create_WhenRequestDateIsMutated_PreservesRequestedBatch", () => {
      const source = batch();
      const payout = PayoutAttempt.create(source);

      // Attempt to alter the supplied and returned request dates.
      source.requestedAt.setTime(0);
      payout.requestedAt.setTime(0);

      expect(payout.amount.toCents()).toBe(100);
      expect(payout.requestedAt).toEqual(requestedAt);
    });

    test("requestedIntent_WhenPayoutIsRequested_ContainsDurableRequestDetails", () => {
      const payout = PayoutAttempt.create(batch());

      const intent = payout.requestedIntent();

      const { amount, ...requestDetails } = intent;
      expect(requestDetails).toEqual({
        kind: "PAYOUT_REQUESTED",
        payoutId: "payout",
        sessionId: "session",
        destination: {
          payoutAccountId: "account",
          userId: "booker",
          providerAccountReference: "provider",
          bankAccountReference: "bank",
        },
        requestedAt,
      });
      expect(amount.toCents()).toBe(100);
    });
  });

  describe("Completion callbacks", () => {
    test("complete_WhenRestoredPayoutHasFailed_ThrowsStalePayout", () => {
      const details = payoutDetails({
        status: "FAILED",
        failedAt: requestedAt,
        failureReason: "failure",
      });
      const payout = new PayoutAttempt(details);

      expect(() => payout.complete("provider", requestedAt)).toThrow(
        expect.objectContaining({ code: "STALE_PAYOUT" }),
      );
    });

    test("complete_WhenSameCallbackIsRepeated_CompletesOnlyOnce", () => {
      const payout = PayoutAttempt.create(batch());

      const completed = payout.complete("provider-result", requestedAt);
      const repeatedCompletion = payout.complete(
        "provider-result",
        requestedAt,
      );

      expect(completed).toBe(true);
      expect(repeatedCompletion).toBe(false);
      expect(payout.status).toBe("COMPLETED");
      expect(payout.providerReference).toBe("provider-result");
    });

    test("complete_WhenProviderReferenceConflicts_ThrowsPayoutConflict", () => {
      const payout = new PayoutAttempt(payoutDetails({
        status: "COMPLETED",
        completedAt: requestedAt,
        providerReference: "provider-result",
      }));

      expect(() => payout.complete("other-result", requestedAt)).toThrow(
        expect.objectContaining({ code: "PAYOUT_CONFLICT" }),
      );
    });

    test("complete_WhenRestoredCompletionMatches_ReturnsFalse", () => {
      const payout = new PayoutAttempt({
        ...batch(),
        payoutAccountId: "account",
        amount: Money.fromCents(100),
        status: "COMPLETED",
        completedAt: requestedAt,
        providerReference: "provider-result",
      });

      const repeatedCompletion = payout.complete(
        "provider-result",
        requestedAt,
      );

      expect(payout.status).toBe("COMPLETED");
      expect(payout.amount.toCents()).toBe(100);
      expect(payout.providerReference).toBe("provider-result");
      expect(repeatedCompletion).toBe(false);
    });

    test("complete_WhenFailureHasBeenRecorded_RejectsLateCallback", () => {
      const payout = new PayoutAttempt(payoutDetails({
        status: "FAILED",
        failedAt: requestedAt,
        failureReason: "timeout",
      }));

      expect(() => payout.complete("late", requestedAt)).toThrow(
        expect.objectContaining({ code: "STALE_PAYOUT" }),
      );
    });
  });

  describe("Failure callbacks", () => {
    test("fail_WhenRestoredFailureMatches_ReturnsFalse", () => {
      const details = payoutDetails({
        status: "FAILED",
        failedAt: requestedAt,
        failureReason: "failure",
      });
      const payout = new PayoutAttempt(details);

      const repeatedFailure = payout.fail("failure", requestedAt);

      expect(repeatedFailure).toBe(false);
      expect(payout.status).toBe("FAILED");
      expect(payout.failureReason).toBe("failure");
    });

    test("fail_WhenSameCallbackIsRepeated_FailsOnlyOnce", () => {
      const payout = PayoutAttempt.create(batch());

      const failed = payout.fail("timeout", requestedAt);
      const repeatedFailure = payout.fail("timeout", requestedAt);

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
