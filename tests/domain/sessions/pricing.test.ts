import { describe, expect, test } from "vitest";
import { sessionPricing, resolveBookingShare } from "@/domain/sessions/pricing";
import { Money } from "@/domain";

describe("Session pricing", () => {
  test("sessionPricing_WhenCostLeavesOneCentRemainder_ReturnsExactBounds", () => {
    // Input
    const costCents = 1001;
    const slots = 3;

    // Log
    const pricing = sessionPricing(costCents, slots);

    // Oracle
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
    // Input
    const costCents = 6000;
    const slots = 8;

    // Log
    const pricing = sessionPricing(costCents, slots);

    // Oracle
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
    // Input
    const costCents = 2;
    const slots = 2;

    // Log
    const pricing = sessionPricing(costCents, slots);

    // Oracle
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
    // Input
    const costCents = Number.MAX_SAFE_INTEGER;
    const slots = 2;

    // Log
    const pricing = sessionPricing(costCents, slots);

    // Oracle
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
    // Input
    const costCents = Number.MAX_SAFE_INTEGER;
    const slots = 8;

    // Log
    const pricing = sessionPricing(costCents, slots);

    // Oracle
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
    // Input
    const costCents = 30000;
    const slots = 30;

    // Log
    const pricing = sessionPricing(costCents, slots);

    // Oracle
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
    // Input
    const costCents = Number.MAX_SAFE_INTEGER;
    const slots = 30;

    // Log
    const pricing = sessionPricing(costCents, slots);

    // Oracle
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
    // Input
    const costCents = 0;
    const slots = 2;

    // Log & Oracle
    expect(() => sessionPricing(costCents, slots)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("sessionPricing_WhenCostCannotFundOneCentPerSlot_RejectsUnsafeOrZeroShare", () => {
    // Input
    const costCents = 1;
    const slots = 2;

    // Log & Oracle
    expect(() => sessionPricing(costCents, slots)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("sessionPricing_WhenCostIsNegative_RejectsUnsafeOrZeroShare", () => {
    // Input
    const costCents = -1;
    const slots = 2;

    // Log & Oracle
    expect(() => sessionPricing(costCents, slots)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("sessionPricing_WhenCostContainsFractionalCents_RejectsUnsafeOrZeroShare", () => {
    // Input
    const costCents = 1.5;
    const slots = 2;

    // Log & Oracle
    expect(() => sessionPricing(costCents, slots)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("sessionPricing_WhenCostIsNotANumber_RejectsUnsafeOrZeroShare", () => {
    // Input
    const costCents = NaN;
    const slots = 2;

    // Log & Oracle
    expect(() => sessionPricing(costCents, slots)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("sessionPricing_WhenCostIsInfinite_RejectsUnsafeOrZeroShare", () => {
    // Input
    const costCents = Infinity;
    const slots = 2;

    // Log & Oracle
    expect(() => sessionPricing(costCents, slots)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("sessionPricing_WhenCostExceedsSafeInteger_RejectsUnsafeOrZeroShare", () => {
    // Input
    const costCents = Number.MAX_SAFE_INTEGER + 1;
    const slots = 2;

    // Log & Oracle
    expect(() => sessionPricing(costCents, slots)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("sessionPricing_WhenCapacityIsZero_RejectsInvalidCapacity", () => {
    // Input
    const costCents = 1000;
    const slots = 0;

    // Log & Oracle
    expect(() => sessionPricing(costCents, slots)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("sessionPricing_WhenCapacityIsOne_RejectsInvalidCapacity", () => {
    // Input
    const costCents = 1000;
    const slots = 1;

    // Log & Oracle
    expect(() => sessionPricing(costCents, slots)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("sessionPricing_WhenCapacityExceedsThirty_RejectsInvalidCapacity", () => {
    // Input
    const costCents = 1000;
    const slots = 31;

    // Log & Oracle
    expect(() => sessionPricing(costCents, slots)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("sessionPricing_WhenCapacityIsFractional_RejectsInvalidCapacity", () => {
    // Input
    const costCents = 1000;
    const slots = 2.5;

    // Log & Oracle
    expect(() => sessionPricing(costCents, slots)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("sessionPricing_WhenCapacityIsNotANumber_RejectsInvalidCapacity", () => {
    // Input
    const costCents = 1000;
    const slots = NaN;

    // Log & Oracle
    expect(() => sessionPricing(costCents, slots)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("resolveBookingShare_WhenPriceIsOmitted_PreservesEqualSplit", () => {
    // Input
    const cost = Money.fromCents(1001);
    const slots = 3;

    // Log
    const share = resolveBookingShare(cost, slots);

    // Oracle
    expect(share.toCents()).toBe(333);
  });

  test("resolveBookingShare_WhenPriceEqualsMinimum_AcceptsBoundedAdjustment", () => {
    // Input
    const cost = Money.fromCents(1001);
    const slots = 3;
    const chosenPrice = Money.fromCents(167);

    // Log
    const share = resolveBookingShare(cost, slots, chosenPrice);

    // Oracle
    expect(share.toCents()).toBe(167);
  });

  test("resolveBookingShare_WhenPriceExceedsEqualSplitByOneCent_AcceptsBoundedAdjustment", () => {
    // Input
    const cost = Money.fromCents(1001);
    const slots = 3;
    const chosenPrice = Money.fromCents(334);

    // Log
    const share = resolveBookingShare(cost, slots, chosenPrice);

    // Oracle
    expect(share.toCents()).toBe(334);
  });

  test("resolveBookingShare_WhenPriceEqualsMaximum_AcceptsBoundedAdjustment", () => {
    // Input
    const cost = Money.fromCents(1001);
    const slots = 3;
    const chosenPrice = Money.fromCents(666);

    // Log
    const share = resolveBookingShare(cost, slots, chosenPrice);

    // Oracle
    expect(share.toCents()).toBe(666);
  });

  test("resolveBookingShare_WhenPriceIsZero_RejectsOutsideBounds", () => {
    // Input
    const cost = Money.fromCents(1001);
    const slots = 3;
    const chosenPrice = Money.fromCents(0);

    // Log & Oracle
    expect(() => resolveBookingShare(cost, slots, chosenPrice)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("resolveBookingShare_WhenPriceIsOneCentBelowMinimum_RejectsOutsideBounds", () => {
    // Input
    const cost = Money.fromCents(1001);
    const slots = 3;
    const chosenPrice = Money.fromCents(166);

    // Log & Oracle
    expect(() => resolveBookingShare(cost, slots, chosenPrice)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("resolveBookingShare_WhenPriceIsOneCentAboveMaximum_RejectsOutsideBounds", () => {
    // Input
    const cost = Money.fromCents(1001);
    const slots = 3;
    const chosenPrice = Money.fromCents(667);

    // Log & Oracle
    expect(() => resolveBookingShare(cost, slots, chosenPrice)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });
});
