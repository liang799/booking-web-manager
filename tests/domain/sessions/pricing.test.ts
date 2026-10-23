import { describe, expect, test } from "vitest";
import { sessionPricing, resolveBookingShare } from "@/domain/sessions/pricing";
import { Money } from "@/domain";

describe("Session pricing", () => {
  describe("Price bounds from booking cost", () => {
    test("sessionPricing_WhenCostLeavesOneCentRemainder_ReturnsExactBounds", () => {
      const costCents = 1001;
      const slots = 3;

      const pricing = sessionPricing(costCents, slots);

      expect(pricing).toEqual({
        suggestedCents: 333,
        minimumCents: 167,
        maximumCents: 666,
      });
      expect(BigInt(pricing.maximumCents) * BigInt(slots)).toBeLessThanOrEqual(
        BigInt(Number.MAX_SAFE_INTEGER),
      );
    });

    test("sessionPricing_WhenEightSlotsShareSixThousandCents_ReturnsExactBounds", () => {
      const costCents = 6000;
      const slots = 8;

      const pricing = sessionPricing(costCents, slots);

      expect(pricing).toEqual({
        suggestedCents: 750,
        minimumCents: 375,
        maximumCents: 1500,
      });
      expect(BigInt(pricing.maximumCents) * BigInt(slots)).toBeLessThanOrEqual(
        BigInt(Number.MAX_SAFE_INTEGER),
      );
    });

    test("sessionPricing_WhenEachSlotCostsOneCent_ReturnsExactBounds", () => {
      const costCents = 2;
      const slots = 2;

      const pricing = sessionPricing(costCents, slots);

      expect(pricing).toEqual({
        suggestedCents: 1,
        minimumCents: 1,
        maximumCents: 2,
      });
      expect(BigInt(pricing.maximumCents) * BigInt(slots)).toBeLessThanOrEqual(
        BigInt(Number.MAX_SAFE_INTEGER),
      );
    });

    test("sessionPricing_WhenMaximumSafeCostHasTwoSlots_ReturnsExactBounds", () => {
      const costCents = Number.MAX_SAFE_INTEGER;
      const slots = 2;

      const pricing = sessionPricing(costCents, slots);

      expect(pricing).toEqual({
        suggestedCents: 4503599627370495,
        minimumCents: 2251799813685248,
        maximumCents: 4503599627370495,
      });
      expect(BigInt(pricing.maximumCents) * BigInt(slots)).toBeLessThanOrEqual(
        BigInt(Number.MAX_SAFE_INTEGER),
      );
    });

    test("sessionPricing_WhenMaximumSafeCostHasEightSlots_ReturnsExactBounds", () => {
      const costCents = Number.MAX_SAFE_INTEGER;
      const slots = 8;

      const pricing = sessionPricing(costCents, slots);

      expect(pricing).toEqual({
        suggestedCents: 1125899906842623,
        minimumCents: 562949953421312,
        maximumCents: 1125899906842623,
      });
      expect(BigInt(pricing.maximumCents) * BigInt(slots)).toBeLessThanOrEqual(
        BigInt(Number.MAX_SAFE_INTEGER),
      );
    });

    test("sessionPricing_WhenCapacityIsThirtySlots_ReturnsExactBounds", () => {
      const costCents = 30000;
      const slots = 30;

      const pricing = sessionPricing(costCents, slots);

      expect(pricing).toEqual({
        suggestedCents: 1000,
        minimumCents: 500,
        maximumCents: 2000,
      });
      expect(BigInt(pricing.maximumCents) * BigInt(slots)).toBeLessThanOrEqual(
        BigInt(Number.MAX_SAFE_INTEGER),
      );
    });

    test("sessionPricing_WhenMaximumSafeCostHasThirtySlots_ReturnsExactBounds", () => {
      const costCents = Number.MAX_SAFE_INTEGER;
      const slots = 30;

      const pricing = sessionPricing(costCents, slots);

      expect(pricing).toEqual({
        suggestedCents: 300239975158033,
        minimumCents: 150119987579017,
        maximumCents: 300239975158033,
      });
      expect(BigInt(pricing.maximumCents) * BigInt(slots)).toBeLessThanOrEqual(
        BigInt(Number.MAX_SAFE_INTEGER),
      );
    });

    test("sessionPricing_WhenCostIsZero_RejectsUnsafeOrZeroShare", () => {
      const costCents = 0;
      const slots = 2;

      expect(() => sessionPricing(costCents, slots)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("sessionPricing_WhenCostCannotFundOneCentPerSlot_RejectsUnsafeOrZeroShare", () => {
      const costCents = 1;
      const slots = 2;

      expect(() => sessionPricing(costCents, slots)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("sessionPricing_WhenCostIsNegative_RejectsUnsafeOrZeroShare", () => {
      const costCents = -1;
      const slots = 2;

      expect(() => sessionPricing(costCents, slots)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("sessionPricing_WhenCostContainsFractionalCents_RejectsUnsafeOrZeroShare", () => {
      const costCents = 1.5;
      const slots = 2;

      expect(() => sessionPricing(costCents, slots)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("sessionPricing_WhenCostIsNotANumber_RejectsUnsafeOrZeroShare", () => {
      const costCents = NaN;
      const slots = 2;

      expect(() => sessionPricing(costCents, slots)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("sessionPricing_WhenCostIsInfinite_RejectsUnsafeOrZeroShare", () => {
      const costCents = Infinity;
      const slots = 2;

      expect(() => sessionPricing(costCents, slots)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("sessionPricing_WhenCostExceedsSafeInteger_RejectsUnsafeOrZeroShare", () => {
      const costCents = Number.MAX_SAFE_INTEGER + 1;
      const slots = 2;

      expect(() => sessionPricing(costCents, slots)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });
  });

  describe("Capacity limits", () => {
    test("sessionPricing_WhenCapacityIsZero_RejectsInvalidCapacity", () => {
      const costCents = 1000;
      const slots = 0;

      expect(() => sessionPricing(costCents, slots)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("sessionPricing_WhenCapacityIsOne_RejectsInvalidCapacity", () => {
      const costCents = 1000;
      const slots = 1;

      expect(() => sessionPricing(costCents, slots)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("sessionPricing_WhenCapacityExceedsThirty_RejectsInvalidCapacity", () => {
      const costCents = 1000;
      const slots = 31;

      expect(() => sessionPricing(costCents, slots)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("sessionPricing_WhenCapacityIsFractional_RejectsInvalidCapacity", () => {
      const costCents = 1000;
      const slots = 2.5;

      expect(() => sessionPricing(costCents, slots)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("sessionPricing_WhenCapacityIsNotANumber_RejectsInvalidCapacity", () => {
      const costCents = 1000;
      const slots = NaN;

      expect(() => sessionPricing(costCents, slots)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });
  });

  describe("Participant price selection", () => {
    test("resolveBookingShare_WhenPriceIsOmitted_PreservesEqualSplit", () => {
      const cost = Money.fromCents(1001);
      const slots = 3;

      const share = resolveBookingShare(cost, slots);

      expect(share.toCents()).toBe(333);
    });

    test("resolveBookingShare_WhenPriceEqualsMinimum_AcceptsBoundedAdjustment", () => {
      const cost = Money.fromCents(1001);
      const slots = 3;
      const chosenPrice = Money.fromCents(167);

      const share = resolveBookingShare(cost, slots, chosenPrice);

      expect(share.toCents()).toBe(167);
    });

    test("resolveBookingShare_WhenPriceExceedsEqualSplitByOneCent_AcceptsBoundedAdjustment", () => {
      const cost = Money.fromCents(1001);
      const slots = 3;
      const chosenPrice = Money.fromCents(334);

      const share = resolveBookingShare(cost, slots, chosenPrice);

      expect(share.toCents()).toBe(334);
    });

    test("resolveBookingShare_WhenPriceEqualsMaximum_AcceptsBoundedAdjustment", () => {
      const cost = Money.fromCents(1001);
      const slots = 3;
      const chosenPrice = Money.fromCents(666);

      const share = resolveBookingShare(cost, slots, chosenPrice);

      expect(share.toCents()).toBe(666);
    });

    test("resolveBookingShare_WhenPriceIsZero_RejectsOutsideBounds", () => {
      const cost = Money.fromCents(1001);
      const slots = 3;
      const chosenPrice = Money.fromCents(0);

      expect(() => resolveBookingShare(cost, slots, chosenPrice)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("resolveBookingShare_WhenPriceIsOneCentBelowMinimum_RejectsOutsideBounds", () => {
      const cost = Money.fromCents(1001);
      const slots = 3;
      const chosenPrice = Money.fromCents(166);

      expect(() => resolveBookingShare(cost, slots, chosenPrice)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("resolveBookingShare_WhenPriceIsOneCentAboveMaximum_RejectsOutsideBounds", () => {
      const cost = Money.fromCents(1001);
      const slots = 3;
      const chosenPrice = Money.fromCents(667);

      expect(() => resolveBookingShare(cost, slots, chosenPrice)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });
  });
});
