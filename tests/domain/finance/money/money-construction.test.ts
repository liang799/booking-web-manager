import { Money } from "@/domain";
import { describe, expect, test } from "vitest";

describe("Money", () => {
  test("fromCents_WhenZero_PreservesExactCents", () => {
    // Input
    const cents = 0;

    // Log
    const money = Money.fromCents(cents);

    // Oracle
    expect(money.toCents()).toBe(0);
  });

  test("fromCents_WhenPositiveCent_PreservesExactCents", () => {
    // Input
    const cents = 1;

    // Log
    const money = Money.fromCents(cents);

    // Oracle
    expect(money.toCents()).toBe(1);
  });

  test("fromCents_WhenNegativeCent_PreservesExactCents", () => {
    // Input
    const cents = -1;

    // Log
    const money = Money.fromCents(cents);

    // Oracle
    expect(money.toCents()).toBe(-1);
  });

  test("fromCents_WhenWholeCents_PreservesExactCents", () => {
    // Input
    const cents = 1001;

    // Log
    const money = Money.fromCents(cents);

    // Oracle
    expect(money.toCents()).toBe(1001);
  });

  test("fromCents_WhenMaximumSafeInteger_PreservesExactCents", () => {
    // Input
    const cents = Number.MAX_SAFE_INTEGER;

    // Log
    const money = Money.fromCents(cents);

    // Oracle
    expect(money.toCents()).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("fromCents_WhenMinimumSafeInteger_PreservesExactCents", () => {
    // Input
    const cents = Number.MIN_SAFE_INTEGER;

    // Log
    const money = Money.fromCents(cents);

    // Oracle
    expect(money.toCents()).toBe(Number.MIN_SAFE_INTEGER);
  });

  test("fromCents_WhenNegativeZero_NormalizesToZero", () => {
    // Input
    const cents = -0;

    // Log
    const money = Money.fromCents(cents);

    // Oracle
    expect(money.toCents()).toBe(0);
  });

  test("fromCents_WhenPositiveFraction_ThrowsRangeError", () => {
    // Input
    const cents = 0.1;

    // Log & Oracle
    expect(() => Money.fromCents(cents)).toThrow(RangeError);
  });

  test("fromCents_WhenNegativeFraction_ThrowsRangeError", () => {
    // Input
    const cents = -0.1;

    // Log & Oracle
    expect(() => Money.fromCents(cents)).toThrow(RangeError);
  });

  test("fromCents_WhenNaN_ThrowsRangeError", () => {
    // Input
    const cents = Number.NaN;

    // Log & Oracle
    expect(() => Money.fromCents(cents)).toThrow(RangeError);
  });

  test("fromCents_WhenPositiveInfinity_ThrowsRangeError", () => {
    // Input
    const cents = Number.POSITIVE_INFINITY;

    // Log & Oracle
    expect(() => Money.fromCents(cents)).toThrow(RangeError);
  });

  test("fromCents_WhenNegativeInfinity_ThrowsRangeError", () => {
    // Input
    const cents = Number.NEGATIVE_INFINITY;

    // Log & Oracle
    expect(() => Money.fromCents(cents)).toThrow(RangeError);
  });

  test("fromCents_WhenAboveMaximum_ThrowsRangeError", () => {
    // Input
    const cents = Number.MAX_SAFE_INTEGER + 1;

    // Log & Oracle
    expect(() => Money.fromCents(cents)).toThrow(RangeError);
  });

  test("fromCents_WhenBelowMinimum_ThrowsRangeError", () => {
    // Input
    const cents = Number.MIN_SAFE_INTEGER - 1;

    // Log & Oracle
    expect(() => Money.fromCents(cents)).toThrow(RangeError);
  });
});
