import { DomainError, FundHold, type FundHoldDetails, Money } from "@/domain";
import { describe, expect, test } from "vitest";

const createdAt = new Date("2026-10-01");
const settledAt = new Date("2026-10-03");

describe("FundHold", () => {
  describe("Construction and lifecycle metadata", () => {
    test("constructor_WhenStateIsHeld_PreservesAmountAndIsolatesDate", () => {
      // Input
      const input = holdDetails({ state: "HELD" });

      // Log
      const hold = new FundHold(input);
      input.createdAt.setTime(0);
      hold.createdAt.setTime(0);

      // Oracle
      expect(hold.state).toBe("HELD");
      expect(hold.amount.toCents()).toBe(500);
      expect(hold.createdAt).toEqual(createdAt);
    });

    test("constructor_WhenStateIsAwaitingReplacement_PreservesAmountAndIsolatesDate", () => {
      // Input
      const input = holdDetails({ state: "AWAITING_REPLACEMENT" });

      // Log
      const hold = new FundHold(input);
      input.createdAt.setTime(0);
      hold.createdAt.setTime(0);

      // Oracle
      expect(hold.state).toBe("AWAITING_REPLACEMENT");
      expect(hold.amount.toCents()).toBe(500);
      expect(hold.createdAt).toEqual(createdAt);
    });

    test("constructor_WhenStateIsForfeitureDue_PreservesAmountAndIsolatesDate", () => {
      // Input
      const input = holdDetails({ state: "FORFEITURE_DUE" });

      // Log
      const hold = new FundHold(input);
      input.createdAt.setTime(0);
      hold.createdAt.setTime(0);

      // Oracle
      expect(hold.state).toBe("FORFEITURE_DUE");
      expect(hold.amount.toCents()).toBe(500);
      expect(hold.createdAt).toEqual(createdAt);
    });

    test("constructor_WhenStateIsRefunded_PreservesTerminalMetadata", () => {
      // Input
      const inputSettledAt = new Date(settledAt);
      const input = holdDetails({
        state: "REFUNDED",
        settledAt: inputSettledAt,
        payoutId: undefined,
      });

      // Log
      const hold = new FundHold(input);
      inputSettledAt.setTime(0);
      hold.settledAt?.setTime(0);

      // Oracle
      expect(hold.state).toBe("REFUNDED");
      expect(hold.settledAt).toEqual(settledAt);
      expect(hold.payoutId).toBe(undefined);
    });

    test("constructor_WhenStateIsReleased_PreservesTerminalMetadata", () => {
      // Input
      const inputSettledAt = new Date(settledAt);
      const input = holdDetails({
        state: "RELEASED",
        settledAt: inputSettledAt,
        payoutId: "payout",
      });

      // Log
      const hold = new FundHold(input);
      inputSettledAt.setTime(0);
      hold.settledAt?.setTime(0);

      // Oracle
      expect(hold.state).toBe("RELEASED");
      expect(hold.settledAt).toEqual(settledAt);
      expect(hold.payoutId).toBe("payout");
    });

    test("constructor_WhenStateIsForfeited_PreservesTerminalMetadata", () => {
      // Input
      const inputSettledAt = new Date(settledAt);
      const input = holdDetails({
        state: "FORFEITED",
        settledAt: inputSettledAt,
        payoutId: "payout",
      });

      // Log
      const hold = new FundHold(input);
      inputSettledAt.setTime(0);
      hold.settledAt?.setTime(0);

      // Oracle
      expect(hold.state).toBe("FORFEITED");
      expect(hold.settledAt).toEqual(settledAt);
      expect(hold.payoutId).toBe("payout");
    });

    test("constructor_WhenReleasedMetadataIsMissing_ThrowsDomainError", () => {
      // Input
      const details = holdDetails({ state: "RELEASED" });

      // Log & Oracle
      expect(() => new FundHold(details)).toThrow(DomainError);
    });

    test("constructor_WhenReleasedPayoutIsMissing_ThrowsDomainError", () => {
      // Input
      const details = holdDetails({ state: "RELEASED", settledAt });

      // Log & Oracle
      expect(() => new FundHold(details)).toThrow(DomainError);
    });

    test("constructor_WhenForfeitedPayoutIsBlank_ThrowsDomainError", () => {
      // Input
      const details = holdDetails({
        state: "FORFEITED",
        settledAt,
        payoutId: " ",
      });

      // Log & Oracle
      expect(() => new FundHold(details)).toThrow(DomainError);
    });

    test("constructor_WhenRefundHasPayout_ThrowsDomainError", () => {
      // Input
      const details = holdDetails({
        state: "REFUNDED",
        settledAt,
        payoutId: "payout",
      });

      // Log & Oracle
      expect(() => new FundHold(details)).toThrow(DomainError);
    });

    test("constructor_WhenActiveHoldHasSettlementDate_ThrowsDomainError", () => {
      // Input
      const details = holdDetails({ settledAt });

      // Log & Oracle
      expect(() => new FundHold(details)).toThrow(DomainError);
    });

    test("constructor_WhenActiveHoldHasPayout_ThrowsDomainError", () => {
      // Input
      const details = holdDetails({ payoutId: "payout" });

      // Log & Oracle
      expect(() => new FundHold(details)).toThrow(DomainError);
    });

    test("constructor_WhenAmountIsZero_ThrowsDomainError", () => {
      // Input
      const details = holdDetails({ amount: Money.fromCents(0) });

      // Log & Oracle
      expect(() => new FundHold(details)).toThrow(DomainError);
    });

    test("constructor_WhenStateIsUnknown_ThrowsDomainError", () => {
      // Input
      const details = holdDetails({
        state: "UNKNOWN" as FundHoldDetails["state"],
      });

      // Log & Oracle
      expect(() => new FundHold(details)).toThrow(DomainError);
    });

    test("constructor_WhenCreationDateIsInvalid_ThrowsRangeError", () => {
      // Input
      const details = holdDetails({ createdAt: new Date(NaN) });

      // Log & Oracle
      expect(() => new FundHold(details)).toThrow(RangeError);
    });
  });

  describe("Refunds", () => {
    test("refund_WhenStateIsRefunded_ThrowsDomainError", () => {
      // Input
      const hold = new FundHold(
        holdDetails({ state: "REFUNDED", settledAt, payoutId: undefined }),
      );

      // Log & Oracle
      expect(() => hold.refund(settledAt)).toThrow(DomainError);
    });

    test("refund_WhenStateIsReleased_ThrowsDomainError", () => {
      // Input
      const hold = new FundHold(
        holdDetails({ state: "RELEASED", settledAt, payoutId: "payout" }),
      );

      // Log & Oracle
      expect(() => hold.refund(settledAt)).toThrow(DomainError);
    });

    test("refund_WhenStateIsForfeited_ThrowsDomainError", () => {
      // Input
      const hold = new FundHold(
        holdDetails({ state: "FORFEITED", settledAt, payoutId: "payout" }),
      );

      // Log & Oracle
      expect(() => hold.refund(settledAt)).toThrow(DomainError);
    });
  });
});

function holdDetails(
  overrides: Partial<FundHoldDetails> = {},
): FundHoldDetails {
  return {
    holdId: "hold",
    participationId: "participation",
    holdingAccountId: "platform",
    walletId: "wallet",
    amount: Money.fromCents(500),
    state: "HELD",
    createdAt: new Date(createdAt),
    ...overrides,
  };
}
