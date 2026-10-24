import { Money } from "@/domain";
import { describe, expect, test } from "vitest";

describe("Money arithmetic at safe integer limits", () => {
  describe("Addition boundaries", () => {
    test("add_WhenMaximumAndMinimumAreCombined_ReturnsZero", () => {
      const maximum = Money.fromCents(Number.MAX_SAFE_INTEGER);
      const minimum = Money.fromCents(Number.MIN_SAFE_INTEGER);

      const sum = maximum.add(minimum);

      expect(sum.toCents()).toBe(0);
    });

    test("add_WhenResultExceedsMaximum_ThrowsRangeError", () => {
      const maximum = Money.fromCents(Number.MAX_SAFE_INTEGER);

      expect(() => maximum.add(Money.fromCents(1))).toThrow(RangeError);
    });

    test("add_WhenResultFallsBelowMinimum_ThrowsRangeError", () => {
      const minimum = Money.fromCents(Number.MIN_SAFE_INTEGER);

      expect(() => minimum.add(Money.fromCents(-1))).toThrow(RangeError);
    });
  });

  describe("Subtraction boundaries", () => {
    test("subtract_WhenOneIsSubtractedFromMaximum_PreservesExactValue", () => {
      const maximum = Money.fromCents(Number.MAX_SAFE_INTEGER);

      const difference = maximum.subtract(Money.fromCents(1));

      expect(difference.toCents()).toBe(Number.MAX_SAFE_INTEGER - 1);
    });

    test("subtract_WhenResultExceedsMaximum_ThrowsRangeError", () => {
      const maximum = Money.fromCents(Number.MAX_SAFE_INTEGER);

      expect(() => maximum.subtract(Money.fromCents(-1))).toThrow(RangeError);
    });

    test("subtract_WhenResultFallsBelowMinimum_ThrowsRangeError", () => {
      const minimum = Money.fromCents(Number.MIN_SAFE_INTEGER);

      expect(() => minimum.subtract(Money.fromCents(1))).toThrow(RangeError);
    });
  });

  describe("Multiplication boundaries", () => {
    test("multiply_WhenMinimumIsNegated_ReturnsMaximum", () => {
      const minimum = Money.fromCents(Number.MIN_SAFE_INTEGER);

      const negatedMinimum = minimum.multiply(-1);

      expect(negatedMinimum.toCents()).toBe(Number.MAX_SAFE_INTEGER);
    });

    test("multiply_WhenOneCentIsScaledToMaximum_PreservesExactValue", () => {
      const oneCent = Money.fromCents(1);

      const scaledUnit = oneCent.multiply(Number.MAX_SAFE_INTEGER);

      expect(scaledUnit.toCents()).toBe(Number.MAX_SAFE_INTEGER);
    });

    test("multiply_WhenMaximumIsDoubled_ThrowsRangeError", () => {
      const maximum = Money.fromCents(Number.MAX_SAFE_INTEGER);

      expect(() => maximum.multiply(2)).toThrow(RangeError);
    });

    test("multiply_WhenMinimumIsDoubled_ThrowsRangeError", () => {
      const minimum = Money.fromCents(Number.MIN_SAFE_INTEGER);

      expect(() => minimum.multiply(2)).toThrow(RangeError);
    });
  });
});
