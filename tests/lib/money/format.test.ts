import { describe, expect, test } from "vitest";
import { formatSgdCents } from "@/lib/money/format";

describe("formatSgdCents", () => {
  test.each([
    [0, "S$0.00"],
    [-0, "S$0.00"],
    [1, "S$0.01"],
    [12850, "S$128.50"],
    [-1250, "-S$12.50"],
    [123456789, "S$1,234,567.89"],
    [Number.MAX_SAFE_INTEGER, "S$90,071,992,547,409.91"],
    [Number.MIN_SAFE_INTEGER, "-S$90,071,992,547,409.91"],
  ])("displays %s integer cents without losing precision", (cents, expected) => {
    expect(formatSgdCents(cents)).toBe(expected);
  });

  test.each([
    1.5, -1.5, NaN, Infinity, -Infinity,
    Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER - 1,
  ])("rejects invalid or unsafe cent value %s", (cents) => {
    expect(() => formatSgdCents(cents)).toThrow(RangeError);
  });
});
