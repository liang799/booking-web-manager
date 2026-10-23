import { Money } from "@/domain";
import { describe, expect, test } from "vitest";

describe("Money", () => {
  test("divideFloor_WhenPositiveRemainder_RoundsDownAndPreservesSource", () => {
    // Input
    const money = Money.fromCents(1001);

    // Log
    const quotient = money.divideFloor(3);
    const sourceCents = money.toCents();

    // Oracle
    expect(quotient.toCents()).toBe(333);
    expect(sourceCents).toBe(1001);
  });

  test("divideFloor_WhenPositiveRemainderIsDividedByOne_ReturnsNewInstance", () => {
    // Input
    const money = Money.fromCents(1001);

    // Log
    const quotient = money.divideFloor(1);

    // Oracle
    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(1001);
  });

  test("divideFloor_WhenNegativeRemainder_RoundsDownAndPreservesSource", () => {
    // Input
    const money = Money.fromCents(-1001);

    // Log
    const quotient = money.divideFloor(3);
    const sourceCents = money.toCents();

    // Oracle
    expect(quotient.toCents()).toBe(-334);
    expect(sourceCents).toBe(-1001);
  });

  test("divideFloor_WhenNegativeRemainderIsDividedByOne_ReturnsNewInstance", () => {
    // Input
    const money = Money.fromCents(-1001);

    // Log
    const quotient = money.divideFloor(1);

    // Oracle
    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(-1001);
  });

  test("divideFloor_WhenPositiveExactDivision_RoundsDownAndPreservesSource", () => {
    // Input
    const money = Money.fromCents(1002);

    // Log
    const quotient = money.divideFloor(3);
    const sourceCents = money.toCents();

    // Oracle
    expect(quotient.toCents()).toBe(334);
    expect(sourceCents).toBe(1002);
  });

  test("divideFloor_WhenPositiveExactDivisionIsDividedByOne_ReturnsNewInstance", () => {
    // Input
    const money = Money.fromCents(1002);

    // Log
    const quotient = money.divideFloor(1);

    // Oracle
    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(1002);
  });

  test("divideFloor_WhenNegativeExactDivision_RoundsDownAndPreservesSource", () => {
    // Input
    const money = Money.fromCents(-1002);

    // Log
    const quotient = money.divideFloor(3);
    const sourceCents = money.toCents();

    // Oracle
    expect(quotient.toCents()).toBe(-334);
    expect(sourceCents).toBe(-1002);
  });

  test("divideFloor_WhenNegativeExactDivisionIsDividedByOne_ReturnsNewInstance", () => {
    // Input
    const money = Money.fromCents(-1002);

    // Log
    const quotient = money.divideFloor(1);

    // Oracle
    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(-1002);
  });

  test("divideFloor_WhenPositiveCent_RoundsDownAndPreservesSource", () => {
    // Input
    const money = Money.fromCents(1);

    // Log
    const quotient = money.divideFloor(3);
    const sourceCents = money.toCents();

    // Oracle
    expect(quotient.toCents()).toBe(0);
    expect(sourceCents).toBe(1);
  });

  test("divideFloor_WhenPositiveCentIsDividedByOne_ReturnsNewInstance", () => {
    // Input
    const money = Money.fromCents(1);

    // Log
    const quotient = money.divideFloor(1);

    // Oracle
    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(1);
  });

  test("divideFloor_WhenNegativeCent_RoundsDownAndPreservesSource", () => {
    // Input
    const money = Money.fromCents(-1);

    // Log
    const quotient = money.divideFloor(3);
    const sourceCents = money.toCents();

    // Oracle
    expect(quotient.toCents()).toBe(-1);
    expect(sourceCents).toBe(-1);
  });

  test("divideFloor_WhenNegativeCentIsDividedByOne_ReturnsNewInstance", () => {
    // Input
    const money = Money.fromCents(-1);

    // Log
    const quotient = money.divideFloor(1);

    // Oracle
    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(-1);
  });

  test("divideFloor_WhenZero_RoundsDownAndPreservesSource", () => {
    // Input
    const money = Money.fromCents(0);

    // Log
    const quotient = money.divideFloor(3);
    const sourceCents = money.toCents();

    // Oracle
    expect(quotient.toCents()).toBe(0);
    expect(sourceCents).toBe(0);
  });

  test("divideFloor_WhenZeroIsDividedByOne_ReturnsNewInstance", () => {
    // Input
    const money = Money.fromCents(0);

    // Log
    const quotient = money.divideFloor(1);

    // Oracle
    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(0);
  });

  test("divideFloor_WhenMaximumSafeInteger_RoundsDownAndPreservesSource", () => {
    // Input
    const money = Money.fromCents(Number.MAX_SAFE_INTEGER);

    // Log
    const quotient = money.divideFloor(2);
    const sourceCents = money.toCents();

    // Oracle
    expect(quotient.toCents()).toBe(4503599627370495);
    expect(sourceCents).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("divideFloor_WhenMaximumSafeIntegerIsDividedByOne_ReturnsNewInstance", () => {
    // Input
    const money = Money.fromCents(Number.MAX_SAFE_INTEGER);

    // Log
    const quotient = money.divideFloor(1);

    // Oracle
    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("divideFloor_WhenMinimumSafeInteger_RoundsDownAndPreservesSource", () => {
    // Input
    const money = Money.fromCents(Number.MIN_SAFE_INTEGER);

    // Log
    const quotient = money.divideFloor(2);
    const sourceCents = money.toCents();

    // Oracle
    expect(quotient.toCents()).toBe(-4503599627370496);
    expect(sourceCents).toBe(Number.MIN_SAFE_INTEGER);
  });

  test("divideFloor_WhenMinimumSafeIntegerIsDividedByOne_ReturnsNewInstance", () => {
    // Input
    const money = Money.fromCents(Number.MIN_SAFE_INTEGER);

    // Log
    const quotient = money.divideFloor(1);

    // Oracle
    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(Number.MIN_SAFE_INTEGER);
  });

  test("divideFloor_WhenJustBelowMaximumDivisor_RoundsDownAndPreservesSource", () => {
    // Input
    const money = Money.fromCents(Number.MAX_SAFE_INTEGER - 1);

    // Log
    const quotient = money.divideFloor(Number.MAX_SAFE_INTEGER);
    const sourceCents = money.toCents();

    // Oracle
    expect(quotient.toCents()).toBe(0);
    expect(sourceCents).toBe(Number.MAX_SAFE_INTEGER - 1);
  });

  test("divideFloor_WhenJustBelowMaximumDivisorIsDividedByOne_ReturnsNewInstance", () => {
    // Input
    const money = Money.fromCents(Number.MAX_SAFE_INTEGER - 1);

    // Log
    const quotient = money.divideFloor(1);

    // Oracle
    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(Number.MAX_SAFE_INTEGER - 1);
  });

  test("divideFloor_WhenDivisorIsZero_ThrowsRangeError", () => {
    // Input
    const money = Money.fromCents(100);

    // Log & Oracle
    expect(() => money.divideFloor(0)).toThrow(RangeError);
  });

  test("divideFloor_WhenDivisorIsNegative_ThrowsRangeError", () => {
    // Input
    const money = Money.fromCents(100);

    // Log & Oracle
    expect(() => money.divideFloor(-1)).toThrow(RangeError);
  });

  test("divideFloor_WhenDivisorIsFractional_ThrowsRangeError", () => {
    // Input
    const money = Money.fromCents(100);

    // Log & Oracle
    expect(() => money.divideFloor(0.5)).toThrow(RangeError);
  });

  test("divideFloor_WhenDivisorIsNaN_ThrowsRangeError", () => {
    // Input
    const money = Money.fromCents(100);

    // Log & Oracle
    expect(() => money.divideFloor(Number.NaN)).toThrow(RangeError);
  });

  test("divideFloor_WhenDivisorIsInfinite_ThrowsRangeError", () => {
    // Input
    const money = Money.fromCents(100);

    // Log & Oracle
    expect(() => money.divideFloor(Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
  });

  test("divideFloor_WhenDivisorIsUnsafeInteger_ThrowsRangeError", () => {
    // Input
    const money = Money.fromCents(100);

    // Log & Oracle
    expect(() => money.divideFloor(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      RangeError,
    );
  });
});
