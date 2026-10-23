import { Money } from "@/domain";
import { describe, expect, test } from "vitest";

describe("Money", () => {
  test("equals_WhenSeparateInstancesHaveEqualValues_ReturnsTrue", () => {
    // Input
    const first = Money.fromCents(500);
    const equal = Money.fromCents(500);

    // Log
    const equalByValue = first.equals(equal);

    // Oracle
    expect(first).not.toBe(equal);
    expect(equalByValue).toBe(true);
  });

  test("equals_WhenValuesDiffer_ReturnsFalse", () => {
    // Input
    const first = Money.fromCents(500);
    const greater = Money.fromCents(501);

    // Log
    const equalByValue = first.equals(greater);

    // Oracle
    expect(equalByValue).toBe(false);
  });

  test("compareTo_WhenValuesAreEqual_ReturnsZero", () => {
    // Input
    const first = Money.fromCents(500);
    const equal = Money.fromCents(500);

    // Log
    const comparison = first.compareTo(equal);

    // Oracle
    expect(comparison).toBe(0);
  });

  test("compareTo_WhenValueIsSmaller_ReturnsNegativeOne", () => {
    // Input
    const first = Money.fromCents(500);
    const greater = Money.fromCents(501);

    // Log
    const comparison = first.compareTo(greater);

    // Oracle
    expect(comparison).toBe(-1);
  });

  test("compareTo_WhenValueIsGreater_ReturnsOne", () => {
    // Input
    const greater = Money.fromCents(501);
    const first = Money.fromCents(500);

    // Log
    const comparison = greater.compareTo(first);

    // Oracle
    expect(comparison).toBe(1);
  });

  test("compareTo_WhenComparingNegativeToZero_ReturnsNegativeOne", () => {
    // Input
    const negative = Money.fromCents(-1);
    const zero = Money.fromCents(0);

    // Log
    const comparison = negative.compareTo(zero);

    // Oracle
    expect(comparison).toBe(-1);
  });
});
