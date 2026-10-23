import { Money } from "@/domain";
import { describe, expect, test } from "vitest";

describe("Money formatting in dollars", () => {
  test("toDollars_WhenZero_ReturnsTwoDecimalPlaces", () => {
    const money = Money.fromCents(0);

    const dollars = money.toDollars();

    expect(dollars).toBe("0.00");
  });

  test("toDollars_WhenOneCent_PadsTheFraction", () => {
    const money = Money.fromCents(1);

    const dollars = money.toDollars();

    expect(dollars).toBe("0.01");
  });

  test("toDollars_WhenWholeDollars_PreservesTwoDecimalPlaces", () => {
    const money = Money.fromCents(1000);

    const dollars = money.toDollars();

    expect(dollars).toBe("10.00");
  });

  test("toDollars_WhenFractionalDollars_ReturnsExactAmount", () => {
    const money = Money.fromCents(333);

    const dollars = money.toDollars();

    expect(dollars).toBe("3.33");
  });

  test("toDollars_WhenNegativeCent_PreservesSign", () => {
    const money = Money.fromCents(-1);

    const dollars = money.toDollars();

    expect(dollars).toBe("-0.01");
  });

  test("toDollars_WhenNegativeDollars_ReturnsExactAmount", () => {
    const money = Money.fromCents(-333);

    const dollars = money.toDollars();

    expect(dollars).toBe("-3.33");
  });

  test("toDollars_WhenMaximumSafeInteger_PreservesEveryCent", () => {
    const money = Money.fromCents(Number.MAX_SAFE_INTEGER);

    const dollars = money.toDollars();

    expect(dollars).toBe("90071992547409.91");
  });

  test("toDollars_WhenMinimumSafeInteger_PreservesEveryCent", () => {
    const money = Money.fromCents(Number.MIN_SAFE_INTEGER);

    const dollars = money.toDollars();

    expect(dollars).toBe("-90071992547409.91");
  });
});
