import { Money } from "@/domain";
import { describe, expect, test } from "vitest";

describe("Money", () => {
  test("fromCents_WhenCreated_ReturnsFrozenInstance", () => {
    // Input
    const cents = 500;

    // Log
    const money = Money.fromCents(cents);

    // Oracle
    expect(Object.isFrozen(money)).toBe(true);
  });

  test("add_WhenBothAmountsArePositive_ReturnsTheirSum", () => {
    // Input
    const first = Money.fromCents(500);
    const second = Money.fromCents(700);

    // Log
    const sum = first.add(second);

    // Oracle
    expect(sum.toCents()).toBe(1200);
  });

  test("add_WhenChainedAfterSubtraction_ReturnsExactAmount", () => {
    // Input
    const first = Money.fromCents(500);
    const second = Money.fromCents(700);

    // Log
    const combined = first.subtract(second).add(first);

    // Oracle
    expect(combined.toCents()).toBe(300);
  });

  test("add_WhenAddingZero_ReturnsNewInstance", () => {
    // Input
    const money = Money.fromCents(500);

    // Log
    const sum = money.add(Money.fromCents(0));

    // Oracle
    expect(sum).not.toBe(money);
    expect(sum.toCents()).toBe(500);
  });

  test("add_WhenAppliedToOperands_PreservesBothValues", () => {
    // Input
    const first = Money.fromCents(500);
    const second = Money.fromCents(700);

    // Log
    first.add(second);

    // Oracle
    expect(first.toCents()).toBe(500);
    expect(second.toCents()).toBe(700);
  });

  test("subtract_WhenSecondAmountIsLarger_ReturnsNegativeDifference", () => {
    // Input
    const first = Money.fromCents(500);
    const second = Money.fromCents(700);

    // Log
    const difference = first.subtract(second);

    // Oracle
    expect(difference.toCents()).toBe(-200);
  });

  test("subtract_WhenAmountIsNegative_IncreasesValue", () => {
    // Input
    const money = Money.fromCents(500);

    // Log
    const difference = money.subtract(Money.fromCents(-100));

    // Oracle
    expect(difference.toCents()).toBe(600);
  });

  test("subtract_WhenSubtractingZero_ReturnsNewInstance", () => {
    // Input
    const money = Money.fromCents(500);

    // Log
    const difference = money.subtract(Money.fromCents(0));

    // Oracle
    expect(difference).not.toBe(money);
    expect(difference.toCents()).toBe(500);
  });

  test("subtract_WhenAppliedToOperands_PreservesBothValues", () => {
    // Input
    const first = Money.fromCents(500);
    const second = Money.fromCents(700);

    // Log
    first.subtract(second);

    // Oracle
    expect(first.toCents()).toBe(500);
    expect(second.toCents()).toBe(700);
  });
});
