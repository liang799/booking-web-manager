import { DomainError, FundHold, type FundHoldDetails, Money } from "@/domain";
import { describe, expect, test } from "vitest";

const createdAt = new Date("2026-10-01");
const settledAt = new Date("2026-10-03");

describe("Fund hold state and settlement metadata", () => {
  describe("Active hold restoration", () => {
    test("constructor_WhenStateIsHeld_PreservesAmountAndIsolatesDate", () => {
      const input = holdDetails({ state: "HELD" });

      const hold = new FundHold(input);
      input.createdAt.setTime(0);
      hold.createdAt.setTime(0);

      expect(hold.state).toBe("HELD");
      expect(hold.amount.toCents()).toBe(500);
      expect(hold.createdAt).toEqual(createdAt);
    });

    test("constructor_WhenStateIsAwaitingReplacement_PreservesAmountAndIsolatesDate", () => {
      const input = holdDetails({ state: "AWAITING_REPLACEMENT" });

      const hold = new FundHold(input);
      input.createdAt.setTime(0);
      hold.createdAt.setTime(0);

      expect(hold.state).toBe("AWAITING_REPLACEMENT");
      expect(hold.amount.toCents()).toBe(500);
      expect(hold.createdAt).toEqual(createdAt);
    });

    test("constructor_WhenStateIsForfeitureDue_PreservesAmountAndIsolatesDate", () => {
      const input = holdDetails({ state: "FORFEITURE_DUE" });

      const hold = new FundHold(input);
      input.createdAt.setTime(0);
      hold.createdAt.setTime(0);

      expect(hold.state).toBe("FORFEITURE_DUE");
      expect(hold.amount.toCents()).toBe(500);
      expect(hold.createdAt).toEqual(createdAt);
    });

    test("constructor_WhenActiveHoldHasSettlementDate_ThrowsDomainError", () => {
      const details = holdDetails({ settledAt });

      expect(() => new FundHold(details)).toThrow(DomainError);
    });

    test("constructor_WhenActiveHoldHasPayout_ThrowsDomainError", () => {
      const details = holdDetails({ payoutId: "payout" });

      expect(() => new FundHold(details)).toThrow(DomainError);
    });

    test("constructor_WhenAmountIsZero_ThrowsDomainError", () => {
      const details = holdDetails({ amount: Money.fromCents(0) });

      expect(() => new FundHold(details)).toThrow(DomainError);
    });

    test("constructor_WhenStateIsUnknown_ThrowsDomainError", () => {
      const details = holdDetails({
        state: "UNKNOWN" as FundHoldDetails["state"],
      });

      expect(() => new FundHold(details)).toThrow(DomainError);
    });

    test("constructor_WhenCreationDateIsInvalid_ThrowsRangeError", () => {
      const details = holdDetails({ createdAt: new Date(NaN) });

      expect(() => new FundHold(details)).toThrow(RangeError);
    });
  });

  describe("Completed settlement restoration", () => {
    test("constructor_WhenStateIsRefunded_PreservesTerminalMetadata", () => {
      const inputSettledAt = new Date(settledAt);
      const input = holdDetails({
        state: "REFUNDED",
        settledAt: inputSettledAt,
        payoutId: undefined,
      });

      const hold = new FundHold(input);
      inputSettledAt.setTime(0);
      hold.settledAt?.setTime(0);

      expect(hold.state).toBe("REFUNDED");
      expect(hold.settledAt).toEqual(settledAt);
      expect(hold.payoutId).toBe(undefined);
    });

    test("constructor_WhenStateIsReleased_PreservesTerminalMetadata", () => {
      const inputSettledAt = new Date(settledAt);
      const input = holdDetails({
        state: "RELEASED",
        settledAt: inputSettledAt,
        payoutId: "payout",
      });

      const hold = new FundHold(input);
      inputSettledAt.setTime(0);
      hold.settledAt?.setTime(0);

      expect(hold.state).toBe("RELEASED");
      expect(hold.settledAt).toEqual(settledAt);
      expect(hold.payoutId).toBe("payout");
    });

    test("constructor_WhenStateIsForfeited_PreservesTerminalMetadata", () => {
      const inputSettledAt = new Date(settledAt);
      const input = holdDetails({
        state: "FORFEITED",
        settledAt: inputSettledAt,
        payoutId: "payout",
      });

      const hold = new FundHold(input);
      inputSettledAt.setTime(0);
      hold.settledAt?.setTime(0);

      expect(hold.state).toBe("FORFEITED");
      expect(hold.settledAt).toEqual(settledAt);
      expect(hold.payoutId).toBe("payout");
    });

    test("constructor_WhenReleasedMetadataIsMissing_ThrowsDomainError", () => {
      const details = holdDetails({ state: "RELEASED" });

      expect(() => new FundHold(details)).toThrow(DomainError);
    });

    test("constructor_WhenReleasedPayoutIsMissing_ThrowsDomainError", () => {
      const details = holdDetails({ state: "RELEASED", settledAt });

      expect(() => new FundHold(details)).toThrow(DomainError);
    });

    test("constructor_WhenForfeitedPayoutIsBlank_ThrowsDomainError", () => {
      const details = holdDetails({
        state: "FORFEITED",
        settledAt,
        payoutId: " ",
      });

      expect(() => new FundHold(details)).toThrow(DomainError);
    });

    test("constructor_WhenRefundHasPayout_ThrowsDomainError", () => {
      const details = holdDetails({
        state: "REFUNDED",
        settledAt,
        payoutId: "payout",
      });

      expect(() => new FundHold(details)).toThrow(DomainError);
    });
  });

  describe("Refund eligibility after settlement", () => {
    test("refund_WhenStateIsRefunded_ThrowsDomainError", () => {
      const hold = new FundHold(
        holdDetails({ state: "REFUNDED", settledAt, payoutId: undefined }),
      );

      expect(() => hold.refund(settledAt)).toThrow(DomainError);
    });

    test("refund_WhenStateIsReleased_ThrowsDomainError", () => {
      const hold = new FundHold(
        holdDetails({ state: "RELEASED", settledAt, payoutId: "payout" }),
      );

      expect(() => hold.refund(settledAt)).toThrow(DomainError);
    });

    test("refund_WhenStateIsForfeited_ThrowsDomainError", () => {
      const hold = new FundHold(
        holdDetails({ state: "FORFEITED", settledAt, payoutId: "payout" }),
      );

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
