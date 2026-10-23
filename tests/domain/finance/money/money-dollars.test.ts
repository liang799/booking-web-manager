import { Money } from "@/domain";
import { describe, expect, test } from "vitest";

describe("Money", () => {
  test("toDollars_WhenZero_ReturnsTwoDecimalPlaces", () => {
    // Input
    const money = Money.fromCents(0);

    // Log
    const dollars = money.toDollars();

    // Oracle
    expect(dollars).toBe("0.00");
  });

  test("toDollars_WhenOneCent_PadsTheFraction", () => {
    // Input
    const money = Money.fromCents(1);

    // Log
    const dollars = money.toDollars();

    // Oracle
    expect(dollars).toBe("0.01");
  });

  test("toDollars_WhenWholeDollars_PreservesTwoDecimalPlaces", () => {
    // Input
    const money = Money.fromCents(1000);

    // Log
    const dollars = money.toDollars();

    // Oracle
    expect(dollars).toBe("10.00");
  });

  test("toDollars_WhenFractionalDollars_ReturnsExactAmount", () => {
    // Input
    const money = Money.fromCents(333);

    // Log
    const dollars = money.toDollars();

    // Oracle
    expect(dollars).toBe("3.33");
  });

  test("toDollars_WhenNegativeCent_PreservesSign", () => {
    // Input
    const money = Money.fromCents(-1);

    // Log
    const dollars = money.toDollars();

    // Oracle
    expect(dollars).toBe("-0.01");
  });

  test("toDollars_WhenNegativeDollars_ReturnsExactAmount", () => {
    // Input
    const money = Money.fromCents(-333);

    // Log
    const dollars = money.toDollars();

    // Oracle
    expect(dollars).toBe("-3.33");
  });

  test("toDollars_WhenMaximumSafeInteger_PreservesEveryCent", () => {
    // Input
    const money = Money.fromCents(Number.MAX_SAFE_INTEGER);

    // Log
    const dollars = money.toDollars();

    // Oracle
    expect(dollars).toBe("90071992547409.91");
  });

  test("toDollars_WhenMinimumSafeInteger_PreservesEveryCent", () => {
    // Input
    const money = Money.fromCents(Number.MIN_SAFE_INTEGER);

    // Log
    const dollars = money.toDollars();

    // Oracle
    expect(dollars).toBe("-90071992547409.91");
  });
});
