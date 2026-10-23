import { Money } from "@/domain";
import { describe, expect, test } from "vitest";

describe("Money", () => {
  test("divideFloor_WhenPositiveRemainder_RoundsDownAndPreservesSource", () => {
    const money = Money.fromCents(1001);

    const quotient = money.divideFloor(3);

    expect(quotient.toCents()).toBe(333);
    expect(money.toCents()).toBe(1001);
  });

  test("divideFloor_WhenPositiveRemainderIsDividedByOne_ReturnsNewInstance", () => {
    const money = Money.fromCents(1001);

    const quotient = money.divideFloor(1);

    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(1001);
  });

  test("divideFloor_WhenNegativeRemainder_RoundsDownAndPreservesSource", () => {
    const money = Money.fromCents(-1001);

    const quotient = money.divideFloor(3);

    expect(quotient.toCents()).toBe(-334);
    expect(money.toCents()).toBe(-1001);
  });

  test("divideFloor_WhenNegativeRemainderIsDividedByOne_ReturnsNewInstance", () => {
    const money = Money.fromCents(-1001);

    const quotient = money.divideFloor(1);

    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(-1001);
  });

  test("divideFloor_WhenPositiveExactDivision_RoundsDownAndPreservesSource", () => {
    const money = Money.fromCents(1002);

    const quotient = money.divideFloor(3);

    expect(quotient.toCents()).toBe(334);
    expect(money.toCents()).toBe(1002);
  });

  test("divideFloor_WhenPositiveExactDivisionIsDividedByOne_ReturnsNewInstance", () => {
    const money = Money.fromCents(1002);

    const quotient = money.divideFloor(1);

    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(1002);
  });

  test("divideFloor_WhenNegativeExactDivision_RoundsDownAndPreservesSource", () => {
    const money = Money.fromCents(-1002);

    const quotient = money.divideFloor(3);

    expect(quotient.toCents()).toBe(-334);
    expect(money.toCents()).toBe(-1002);
  });

  test("divideFloor_WhenNegativeExactDivisionIsDividedByOne_ReturnsNewInstance", () => {
    const money = Money.fromCents(-1002);

    const quotient = money.divideFloor(1);

    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(-1002);
  });

  test("divideFloor_WhenPositiveCent_RoundsDownAndPreservesSource", () => {
    const money = Money.fromCents(1);

    const quotient = money.divideFloor(3);

    expect(quotient.toCents()).toBe(0);
    expect(money.toCents()).toBe(1);
  });

  test("divideFloor_WhenPositiveCentIsDividedByOne_ReturnsNewInstance", () => {
    const money = Money.fromCents(1);

    const quotient = money.divideFloor(1);

    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(1);
  });

  test("divideFloor_WhenNegativeCent_RoundsDownAndPreservesSource", () => {
    const money = Money.fromCents(-1);

    const quotient = money.divideFloor(3);

    expect(quotient.toCents()).toBe(-1);
    expect(money.toCents()).toBe(-1);
  });

  test("divideFloor_WhenNegativeCentIsDividedByOne_ReturnsNewInstance", () => {
    const money = Money.fromCents(-1);

    const quotient = money.divideFloor(1);

    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(-1);
  });

  test("divideFloor_WhenZero_RoundsDownAndPreservesSource", () => {
    const money = Money.fromCents(0);

    const quotient = money.divideFloor(3);

    expect(quotient.toCents()).toBe(0);
    expect(money.toCents()).toBe(0);
  });

  test("divideFloor_WhenZeroIsDividedByOne_ReturnsNewInstance", () => {
    const money = Money.fromCents(0);

    const quotient = money.divideFloor(1);

    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(0);
  });

  test("divideFloor_WhenMaximumSafeInteger_RoundsDownAndPreservesSource", () => {
    const money = Money.fromCents(Number.MAX_SAFE_INTEGER);

    const quotient = money.divideFloor(2);

    expect(quotient.toCents()).toBe(4503599627370495);
    expect(money.toCents()).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("divideFloor_WhenMaximumSafeIntegerIsDividedByOne_ReturnsNewInstance", () => {
    const money = Money.fromCents(Number.MAX_SAFE_INTEGER);

    const quotient = money.divideFloor(1);

    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("divideFloor_WhenMinimumSafeInteger_RoundsDownAndPreservesSource", () => {
    const money = Money.fromCents(Number.MIN_SAFE_INTEGER);

    const quotient = money.divideFloor(2);

    expect(quotient.toCents()).toBe(-4503599627370496);
    expect(money.toCents()).toBe(Number.MIN_SAFE_INTEGER);
  });

  test("divideFloor_WhenMinimumSafeIntegerIsDividedByOne_ReturnsNewInstance", () => {
    const money = Money.fromCents(Number.MIN_SAFE_INTEGER);

    const quotient = money.divideFloor(1);

    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(Number.MIN_SAFE_INTEGER);
  });

  test("divideFloor_WhenJustBelowMaximumDivisor_RoundsDownAndPreservesSource", () => {
    const money = Money.fromCents(Number.MAX_SAFE_INTEGER - 1);

    const quotient = money.divideFloor(Number.MAX_SAFE_INTEGER);

    expect(quotient.toCents()).toBe(0);
    expect(money.toCents()).toBe(Number.MAX_SAFE_INTEGER - 1);
  });

  test("divideFloor_WhenJustBelowMaximumDivisorIsDividedByOne_ReturnsNewInstance", () => {
    const money = Money.fromCents(Number.MAX_SAFE_INTEGER - 1);

    const quotient = money.divideFloor(1);

    expect(quotient).not.toBe(money);
    expect(quotient.toCents()).toBe(Number.MAX_SAFE_INTEGER - 1);
  });

  test("divideFloor_WhenDivisorIsZero_ThrowsRangeError", () => {
    const money = Money.fromCents(100);

    expect(() => money.divideFloor(0)).toThrow(RangeError);
  });

  test("divideFloor_WhenDivisorIsNegative_ThrowsRangeError", () => {
    const money = Money.fromCents(100);

    expect(() => money.divideFloor(-1)).toThrow(RangeError);
  });

  test("divideFloor_WhenDivisorIsFractional_ThrowsRangeError", () => {
    const money = Money.fromCents(100);

    expect(() => money.divideFloor(0.5)).toThrow(RangeError);
  });

  test("divideFloor_WhenDivisorIsNaN_ThrowsRangeError", () => {
    const money = Money.fromCents(100);

    expect(() => money.divideFloor(Number.NaN)).toThrow(RangeError);
  });

  test("divideFloor_WhenDivisorIsInfinite_ThrowsRangeError", () => {
    const money = Money.fromCents(100);

    expect(() => money.divideFloor(Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
  });

  test("divideFloor_WhenDivisorIsUnsafeInteger_ThrowsRangeError", () => {
    const money = Money.fromCents(100);

    expect(() => money.divideFloor(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      RangeError,
    );
  });
});
