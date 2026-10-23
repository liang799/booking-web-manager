import { ReliabilityScore } from "@/domain";
import { describe, expect, test } from "vitest";

describe("ReliabilityScore", () => {
  test("from_WhenScoreIsZero_PreservesValue", () => {
    const value = 0;

    const score = ReliabilityScore.from(value);

    expect(score.toNumber()).toBe(0);
  });

  test("from_WhenScoreIsMaximum_PreservesValue", () => {
    const value = 100;

    const score = ReliabilityScore.from(value);

    expect(score.toNumber()).toBe(100);
  });

  test("from_WhenScoreIsWholeNumber_PreservesValue", () => {
    const value = 48;

    const score = ReliabilityScore.from(value);

    expect(score.toNumber()).toBe(48);
  });

  test("from_WhenScoreIsFraction_PreservesValue", () => {
    const value = 66.66666666666667;

    const score = ReliabilityScore.from(value);

    expect(score.toNumber()).toBe(66.66666666666667);
  });

  test("from_WhenScoreIsNegativeZero_NormalizesToZero", () => {
    const score = -0;

    const reliability = ReliabilityScore.from(score);

    expect(reliability.toNumber()).toBe(0);
  });

  test("from_WhenScoreIsBelowZero_ThrowsRangeError", () => {
    const value = -0.001;

    expect(() => ReliabilityScore.from(value)).toThrow(RangeError);
  });

  test("from_WhenScoreIsAboveMaximum_ThrowsRangeError", () => {
    const value = 100.001;

    expect(() => ReliabilityScore.from(value)).toThrow(RangeError);
  });

  test("from_WhenScoreIsNaN_ThrowsRangeError", () => {
    const value = Number.NaN;

    expect(() => ReliabilityScore.from(value)).toThrow(RangeError);
  });

  test("from_WhenScoreIsPositiveInfinity_ThrowsRangeError", () => {
    const value = Number.POSITIVE_INFINITY;

    expect(() => ReliabilityScore.from(value)).toThrow(RangeError);
  });

  test("from_WhenScoreIsNegativeInfinity_ThrowsRangeError", () => {
    const value = Number.NEGATIVE_INFINITY;

    expect(() => ReliabilityScore.from(value)).toThrow(RangeError);
  });

  test("equals_WhenValuesAreEqual_ReturnsTrue", () => {
    const score = ReliabilityScore.from(75.5);
    const other = ReliabilityScore.from(75.5);

    const comparison = score.equals(other);

    expect(score).not.toBe(other);
    expect(comparison).toBe(true);
  });

  test("equals_WhenValuesDiffer_ReturnsFalse", () => {
    const score = ReliabilityScore.from(75.5);
    const other = ReliabilityScore.from(80);

    const comparison = score.equals(other);

    expect(comparison).toBe(false);
  });

  test("compareTo_WhenValuesAreEqual_ReturnsZero", () => {
    const score = ReliabilityScore.from(75.5);
    const other = ReliabilityScore.from(75.5);

    const comparison = score.compareTo(other);

    expect(comparison).toBe(0);
  });

  test("compareTo_WhenValueIsSmaller_ReturnsNegativeOne", () => {
    const score = ReliabilityScore.from(75.5);
    const other = ReliabilityScore.from(80);

    const comparison = score.compareTo(other);

    expect(comparison).toBe(-1);
  });

  test("compareTo_WhenValueIsGreater_ReturnsOne", () => {
    const score = ReliabilityScore.from(80);
    const other = ReliabilityScore.from(75.5);

    const comparison = score.compareTo(other);

    expect(comparison).toBe(1);
  });

  test("meetsMinimum_WhenAboveThreshold_ReturnsTrue", () => {
    const score = ReliabilityScore.from(75.5);
    const threshold = ReliabilityScore.from(75);

    const meetsThreshold = score.meetsMinimum(threshold);

    expect(meetsThreshold).toBe(true);
  });

  test("meetsMinimum_WhenAtThreshold_ReturnsTrue", () => {
    const score = ReliabilityScore.from(75.5);
    const threshold = ReliabilityScore.from(75.5);

    const meetsThreshold = score.meetsMinimum(threshold);

    expect(meetsThreshold).toBe(true);
  });

  test("meetsMinimum_WhenBelowThreshold_ReturnsFalse", () => {
    const score = ReliabilityScore.from(75.5);
    const threshold = ReliabilityScore.from(75.5001);

    const meetsThreshold = score.meetsMinimum(threshold);

    expect(meetsThreshold).toBe(false);
  });

  test("meetsMinimum_WhenBothZero_ReturnsTrue", () => {
    const score = ReliabilityScore.from(0);
    const threshold = ReliabilityScore.from(0);

    const meetsThreshold = score.meetsMinimum(threshold);

    expect(meetsThreshold).toBe(true);
  });

  test("meetsMinimum_WhenBothMaximum_ReturnsTrue", () => {
    const score = ReliabilityScore.from(100);
    const threshold = ReliabilityScore.from(100);

    const meetsThreshold = score.meetsMinimum(threshold);

    expect(meetsThreshold).toBe(true);
  });

  test("toNumber_WhenScoreIsFractional_PreservesImmutableValue", () => {
    const score = ReliabilityScore.from(66.66666666666667);

    const numericScore = score.toNumber();

    expect(Object.isFrozen(score)).toBe(true);
    expect(numericScore).toBe(66.66666666666667);
  });
});
