import { ReliabilityScore } from "@/domain";
import { describe, expect, test } from "vitest";

describe("ReliabilityScore", () => {
  test("from_WhenScoreIsZero_PreservesValue", () => {
    // Input
    const value = 0;

    // Log
    const score = ReliabilityScore.from(value);

    // Oracle
    expect(score.toNumber()).toBe(0);
  });

  test("from_WhenScoreIsMaximum_PreservesValue", () => {
    // Input
    const value = 100;

    // Log
    const score = ReliabilityScore.from(value);

    // Oracle
    expect(score.toNumber()).toBe(100);
  });

  test("from_WhenScoreIsWholeNumber_PreservesValue", () => {
    // Input
    const value = 48;

    // Log
    const score = ReliabilityScore.from(value);

    // Oracle
    expect(score.toNumber()).toBe(48);
  });

  test("from_WhenScoreIsFraction_PreservesValue", () => {
    // Input
    const value = 66.66666666666667;

    // Log
    const score = ReliabilityScore.from(value);

    // Oracle
    expect(score.toNumber()).toBe(66.66666666666667);
  });

  test("from_WhenScoreIsNegativeZero_NormalizesToZero", () => {
    // Input
    const score = -0;

    // Log
    const reliability = ReliabilityScore.from(score);

    // Oracle
    expect(reliability.toNumber()).toBe(0);
  });

  test("from_WhenScoreIsBelowZero_ThrowsRangeError", () => {
    // Input
    const value = -0.001;

    // Log & Oracle
    expect(() => ReliabilityScore.from(value)).toThrow(RangeError);
  });

  test("from_WhenScoreIsAboveMaximum_ThrowsRangeError", () => {
    // Input
    const value = 100.001;

    // Log & Oracle
    expect(() => ReliabilityScore.from(value)).toThrow(RangeError);
  });

  test("from_WhenScoreIsNaN_ThrowsRangeError", () => {
    // Input
    const value = Number.NaN;

    // Log & Oracle
    expect(() => ReliabilityScore.from(value)).toThrow(RangeError);
  });

  test("from_WhenScoreIsPositiveInfinity_ThrowsRangeError", () => {
    // Input
    const value = Number.POSITIVE_INFINITY;

    // Log & Oracle
    expect(() => ReliabilityScore.from(value)).toThrow(RangeError);
  });

  test("from_WhenScoreIsNegativeInfinity_ThrowsRangeError", () => {
    // Input
    const value = Number.NEGATIVE_INFINITY;

    // Log & Oracle
    expect(() => ReliabilityScore.from(value)).toThrow(RangeError);
  });

  test("equals_WhenValuesAreEqual_ReturnsTrue", () => {
    // Input
    const score = ReliabilityScore.from(75.5);
    const other = ReliabilityScore.from(75.5);

    // Log
    const comparison = score.equals(other);

    // Oracle
    expect(score).not.toBe(other);
    expect(comparison).toBe(true);
  });

  test("equals_WhenValuesDiffer_ReturnsFalse", () => {
    // Input
    const score = ReliabilityScore.from(75.5);
    const other = ReliabilityScore.from(80);

    // Log
    const comparison = score.equals(other);

    // Oracle
    expect(comparison).toBe(false);
  });

  test("compareTo_WhenValuesAreEqual_ReturnsZero", () => {
    // Input
    const score = ReliabilityScore.from(75.5);
    const other = ReliabilityScore.from(75.5);

    // Log
    const comparison = score.compareTo(other);

    // Oracle
    expect(comparison).toBe(0);
  });

  test("compareTo_WhenValueIsSmaller_ReturnsNegativeOne", () => {
    // Input
    const score = ReliabilityScore.from(75.5);
    const other = ReliabilityScore.from(80);

    // Log
    const comparison = score.compareTo(other);

    // Oracle
    expect(comparison).toBe(-1);
  });

  test("compareTo_WhenValueIsGreater_ReturnsOne", () => {
    // Input
    const score = ReliabilityScore.from(80);
    const other = ReliabilityScore.from(75.5);

    // Log
    const comparison = score.compareTo(other);

    // Oracle
    expect(comparison).toBe(1);
  });

  test("meetsMinimum_WhenAboveThreshold_ReturnsTrue", () => {
    // Input
    const score = ReliabilityScore.from(75.5);
    const threshold = ReliabilityScore.from(75);

    // Log
    const meetsThreshold = score.meetsMinimum(threshold);

    // Oracle
    expect(meetsThreshold).toBe(true);
  });

  test("meetsMinimum_WhenAtThreshold_ReturnsTrue", () => {
    // Input
    const score = ReliabilityScore.from(75.5);
    const threshold = ReliabilityScore.from(75.5);

    // Log
    const meetsThreshold = score.meetsMinimum(threshold);

    // Oracle
    expect(meetsThreshold).toBe(true);
  });

  test("meetsMinimum_WhenBelowThreshold_ReturnsFalse", () => {
    // Input
    const score = ReliabilityScore.from(75.5);
    const threshold = ReliabilityScore.from(75.5001);

    // Log
    const meetsThreshold = score.meetsMinimum(threshold);

    // Oracle
    expect(meetsThreshold).toBe(false);
  });

  test("meetsMinimum_WhenBothZero_ReturnsTrue", () => {
    // Input
    const score = ReliabilityScore.from(0);
    const threshold = ReliabilityScore.from(0);

    // Log
    const meetsThreshold = score.meetsMinimum(threshold);

    // Oracle
    expect(meetsThreshold).toBe(true);
  });

  test("meetsMinimum_WhenBothMaximum_ReturnsTrue", () => {
    // Input
    const score = ReliabilityScore.from(100);
    const threshold = ReliabilityScore.from(100);

    // Log
    const meetsThreshold = score.meetsMinimum(threshold);

    // Oracle
    expect(meetsThreshold).toBe(true);
  });

  test("toNumber_WhenScoreIsFractional_PreservesImmutableValue", () => {
    // Input
    const score = ReliabilityScore.from(66.66666666666667);

    // Log
    const numericScore = score.toNumber();
    const frozen = Object.isFrozen(score);

    // Oracle
    expect(frozen).toBe(true);
    expect(numericScore).toBe(66.66666666666667);
  });
});
