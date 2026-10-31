import { Money } from "@/domain";
import { describe, expect, test } from "vitest";

describe("Money creation from integer cents", () => {
  describe("Exact cent values", () => {
    test("fromCents_WhenZero_PreservesExactCents", () => {
      const cents = 0;

      const money = Money.fromCents(cents);

      expect(money.toCents()).toBe(0);
    });

    test("fromCents_WhenPositiveCent_PreservesExactCents", () => {
      const cents = 1;

      const money = Money.fromCents(cents);

      expect(money.toCents()).toBe(1);
    });

    test("fromCents_WhenNegativeCent_PreservesExactCents", () => {
      const cents = -1;

      const money = Money.fromCents(cents);

      expect(money.toCents()).toBe(-1);
    });

    test("fromCents_WhenWholeCents_PreservesExactCents", () => {
      const cents = 1001;

      const money = Money.fromCents(cents);

      expect(money.toCents()).toBe(1001);
    });

    test("fromCents_WhenMaximumSafeInteger_PreservesExactCents", () => {
      const cents = Number.MAX_SAFE_INTEGER;

      const money = Money.fromCents(cents);

      expect(money.toCents()).toBe(Number.MAX_SAFE_INTEGER);
    });

    test("fromCents_WhenMinimumSafeInteger_PreservesExactCents", () => {
      const cents = Number.MIN_SAFE_INTEGER;

      const money = Money.fromCents(cents);

      expect(money.toCents()).toBe(Number.MIN_SAFE_INTEGER);
    });

    test("fromCents_WhenNegativeZero_NormalizesToZero", () => {
      const cents = -0;

      const money = Money.fromCents(cents);

      expect(money.toCents()).toBe(0);
    });
  });

  describe("Cent input validation", () => {
    test("fromCents_WhenPositiveFraction_ThrowsRangeError", () => {
      const cents = 0.1;

      expect(() => Money.fromCents(cents)).toThrow(RangeError);
    });

    test("fromCents_WhenNegativeFraction_ThrowsRangeError", () => {
      const cents = -0.1;

      expect(() => Money.fromCents(cents)).toThrow(RangeError);
    });

    test("fromCents_WhenNaN_ThrowsRangeError", () => {
      const cents = Number.NaN;

      expect(() => Money.fromCents(cents)).toThrow(RangeError);
    });

    test("fromCents_WhenPositiveInfinity_ThrowsRangeError", () => {
      const cents = Number.POSITIVE_INFINITY;

      expect(() => Money.fromCents(cents)).toThrow(RangeError);
    });

    test("fromCents_WhenNegativeInfinity_ThrowsRangeError", () => {
      const cents = Number.NEGATIVE_INFINITY;

      expect(() => Money.fromCents(cents)).toThrow(RangeError);
    });

    test("fromCents_WhenAboveMaximum_ThrowsRangeError", () => {
      const cents = Number.MAX_SAFE_INTEGER + 1;

      expect(() => Money.fromCents(cents)).toThrow(RangeError);
    });

    test("fromCents_WhenBelowMinimum_ThrowsRangeError", () => {
      const cents = Number.MIN_SAFE_INTEGER - 1;

      expect(() => Money.fromCents(cents)).toThrow(RangeError);
    });
  });
});
