import { Money } from "@/domain";
import { describe, expect, test } from "vitest";

describe("Money equality and ordering", () => {
  test("equals_WhenSeparateInstancesHaveEqualValues_ReturnsTrue", () => {
    const first = Money.fromCents(500);
    const equal = Money.fromCents(500);

    const equalByValue = first.equals(equal);

    expect(first).not.toBe(equal);
    expect(equalByValue).toBe(true);
  });

  test("equals_WhenValuesDiffer_ReturnsFalse", () => {
    const first = Money.fromCents(500);
    const greater = Money.fromCents(501);

    const equalByValue = first.equals(greater);

    expect(equalByValue).toBe(false);
  });

  test("compareTo_WhenValuesAreEqual_ReturnsZero", () => {
    const first = Money.fromCents(500);
    const equal = Money.fromCents(500);

    const comparison = first.compareTo(equal);

    expect(comparison).toBe(0);
  });

  test("compareTo_WhenValueIsSmaller_ReturnsNegativeOne", () => {
    const first = Money.fromCents(500);
    const greater = Money.fromCents(501);

    const comparison = first.compareTo(greater);

    expect(comparison).toBe(-1);
  });

  test("compareTo_WhenValueIsGreater_ReturnsOne", () => {
    const greater = Money.fromCents(501);
    const first = Money.fromCents(500);

    const comparison = greater.compareTo(first);

    expect(comparison).toBe(1);
  });

  test("compareTo_WhenComparingNegativeToZero_ReturnsNegativeOne", () => {
    const negative = Money.fromCents(-1);
    const zero = Money.fromCents(0);

    const comparison = negative.compareTo(zero);

    expect(comparison).toBe(-1);
  });
});
