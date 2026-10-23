import { Money } from "@/domain";
import { describe, expect, test } from "vitest";

describe("Money", () => {
  test("fromCents_WhenCreated_ReturnsFrozenInstance", () => {
    const cents = 500;

    const money = Money.fromCents(cents);

    expect(Object.isFrozen(money)).toBe(true);
  });

  test("add_WhenBothAmountsArePositive_ReturnsTheirSum", () => {
    const first = Money.fromCents(500);
    const second = Money.fromCents(700);

    const sum = first.add(second);

    expect(sum.toCents()).toBe(1200);
  });

  test("add_WhenChainedAfterSubtraction_ReturnsExactAmount", () => {
    const first = Money.fromCents(500);
    const second = Money.fromCents(700);

    const combined = first.subtract(second).add(first);

    expect(combined.toCents()).toBe(300);
  });

  test("add_WhenAddingZero_ReturnsNewInstance", () => {
    const money = Money.fromCents(500);

    const sum = money.add(Money.fromCents(0));

    expect(sum).not.toBe(money);
    expect(sum.toCents()).toBe(500);
  });

  test("add_WhenAppliedToOperands_PreservesBothValues", () => {
    const first = Money.fromCents(500);
    const second = Money.fromCents(700);

    first.add(second);

    expect(first.toCents()).toBe(500);
    expect(second.toCents()).toBe(700);
  });

  test("subtract_WhenSecondAmountIsLarger_ReturnsNegativeDifference", () => {
    const first = Money.fromCents(500);
    const second = Money.fromCents(700);

    const difference = first.subtract(second);

    expect(difference.toCents()).toBe(-200);
  });

  test("subtract_WhenAmountIsNegative_IncreasesValue", () => {
    const money = Money.fromCents(500);

    const difference = money.subtract(Money.fromCents(-100));

    expect(difference.toCents()).toBe(600);
  });

  test("subtract_WhenSubtractingZero_ReturnsNewInstance", () => {
    const money = Money.fromCents(500);

    const difference = money.subtract(Money.fromCents(0));

    expect(difference).not.toBe(money);
    expect(difference.toCents()).toBe(500);
  });

  test("subtract_WhenAppliedToOperands_PreservesBothValues", () => {
    const first = Money.fromCents(500);
    const second = Money.fromCents(700);

    first.subtract(second);

    expect(first.toCents()).toBe(500);
    expect(second.toCents()).toBe(700);
  });
});
