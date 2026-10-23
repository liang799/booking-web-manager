import { Money } from "@/domain";
import { describe, expect, test } from "vitest";

describe("Money", () => {
  test("multiply_WhenFactorIsPositive_ReturnsProductAndPreservesSource", () => {
    // Input
    const money = Money.fromCents(500);

    // Log
    const product = money.multiply(3);

    // Oracle
    expect(product.toCents()).toBe(1500);
    expect(money.toCents()).toBe(500);
  });

  test("multiply_WhenFactorIsNegative_ReturnsProductAndPreservesSource", () => {
    // Input
    const money = Money.fromCents(500);

    // Log
    const product = money.multiply(-3);

    // Oracle
    expect(product.toCents()).toBe(-1500);
    expect(money.toCents()).toBe(500);
  });

  test("multiply_WhenFactorIsZero_ReturnsProductAndPreservesSource", () => {
    // Input
    const money = Money.fromCents(500);

    // Log
    const product = money.multiply(0);

    // Oracle
    expect(product.toCents()).toBe(0);
    expect(money.toCents()).toBe(500);
  });

  test("multiply_WhenFactorIsOne_ReturnsNewInstance", () => {
    // Input
    const money = Money.fromCents(500);

    // Log
    const product = money.multiply(1);

    // Oracle
    expect(product).not.toBe(money);
    expect(product.toCents()).toBe(500);
  });

  test("multiply_WhenFactorIsFractional_RejectsEvenForZeroCents", () => {
    // Input
    const money = Money.fromCents(0);

    // Log & Oracle
    expect(() => money.multiply(0.5)).toThrow(RangeError);
  });

  test("multiply_WhenFactorIsNaN_RejectsEvenForZeroCents", () => {
    // Input
    const money = Money.fromCents(0);

    // Log & Oracle
    expect(() => money.multiply(Number.NaN)).toThrow(RangeError);
  });

  test("multiply_WhenFactorIsPositiveInfinity_RejectsEvenForZeroCents", () => {
    // Input
    const money = Money.fromCents(0);

    // Log & Oracle
    expect(() => money.multiply(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  test("multiply_WhenFactorIsNegativeInfinity_RejectsEvenForZeroCents", () => {
    // Input
    const money = Money.fromCents(0);

    // Log & Oracle
    expect(() => money.multiply(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });

  test("multiply_WhenFactorIsAboveMaximum_RejectsEvenForZeroCents", () => {
    // Input
    const money = Money.fromCents(0);

    // Log & Oracle
    expect(() => money.multiply(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      RangeError,
    );
  });

  test("multiply_WhenFactorIsBelowMinimum_RejectsEvenForZeroCents", () => {
    // Input
    const money = Money.fromCents(0);

    // Log & Oracle
    expect(() => money.multiply(Number.MIN_SAFE_INTEGER - 1)).toThrow(
      RangeError,
    );
  });
});
