import { Money } from "@/domain";
import { describe, expect, test } from "vitest";

describe("Money", () => {
  test("add_WhenMaximumAndMinimumAreCombined_ReturnsZero", () => {
    // Input
    const maximum = Money.fromCents(Number.MAX_SAFE_INTEGER);
    const minimum = Money.fromCents(Number.MIN_SAFE_INTEGER);

    // Log
    const sum = maximum.add(minimum);

    // Oracle
    expect(sum.toCents()).toBe(0);
  });

  test("add_WhenResultExceedsMaximum_ThrowsRangeError", () => {
    // Input
    const maximum = Money.fromCents(Number.MAX_SAFE_INTEGER);

    // Log & Oracle
    expect(() => maximum.add(Money.fromCents(1))).toThrow(RangeError);
  });

  test("add_WhenResultFallsBelowMinimum_ThrowsRangeError", () => {
    // Input
    const minimum = Money.fromCents(Number.MIN_SAFE_INTEGER);

    // Log & Oracle
    expect(() => minimum.add(Money.fromCents(-1))).toThrow(RangeError);
  });

  test("subtract_WhenOneIsSubtractedFromMaximum_PreservesExactValue", () => {
    // Input
    const maximum = Money.fromCents(Number.MAX_SAFE_INTEGER);

    // Log
    const difference = maximum.subtract(Money.fromCents(1));

    // Oracle
    expect(difference.toCents()).toBe(Number.MAX_SAFE_INTEGER - 1);
  });

  test("subtract_WhenResultExceedsMaximum_ThrowsRangeError", () => {
    // Input
    const maximum = Money.fromCents(Number.MAX_SAFE_INTEGER);

    // Log & Oracle
    expect(() => maximum.subtract(Money.fromCents(-1))).toThrow(RangeError);
  });

  test("subtract_WhenResultFallsBelowMinimum_ThrowsRangeError", () => {
    // Input
    const minimum = Money.fromCents(Number.MIN_SAFE_INTEGER);

    // Log & Oracle
    expect(() => minimum.subtract(Money.fromCents(1))).toThrow(RangeError);
  });

  test("multiply_WhenMinimumIsNegated_ReturnsMaximum", () => {
    // Input
    const minimum = Money.fromCents(Number.MIN_SAFE_INTEGER);

    // Log
    const negatedMinimum = minimum.multiply(-1);

    // Oracle
    expect(negatedMinimum.toCents()).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("multiply_WhenOneCentIsScaledToMaximum_PreservesExactValue", () => {
    // Input
    const oneCent = Money.fromCents(1);

    // Log
    const scaledUnit = oneCent.multiply(Number.MAX_SAFE_INTEGER);

    // Oracle
    expect(scaledUnit.toCents()).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("multiply_WhenMaximumIsDoubled_ThrowsRangeError", () => {
    // Input
    const maximum = Money.fromCents(Number.MAX_SAFE_INTEGER);

    // Log & Oracle
    expect(() => maximum.multiply(2)).toThrow(RangeError);
  });

  test("multiply_WhenMinimumIsDoubled_ThrowsRangeError", () => {
    // Input
    const minimum = Money.fromCents(Number.MIN_SAFE_INTEGER);

    // Log & Oracle
    expect(() => minimum.multiply(2)).toThrow(RangeError);
  });
});
