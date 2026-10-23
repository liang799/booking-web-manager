import {
  DomainError,
  LedgerTransaction,
  type LedgerTransactionDetails,
  Money,
} from "@/domain";
import { describe, expect, test } from "vitest";

describe("LedgerTransaction", () => {
  test("constructor_WhenDatesAreMutated_PreservesFinancialFact", () => {
    // Input
    const input = transactionDetails();
    const transaction = new LedgerTransaction(input);

    // Log
    input.occurredAt.setTime(0);
    transaction.occurredAt.setTime(0);

    // Oracle
    expect(transaction.transactionId).toBe("transaction");
    expect(transaction.walletId).toBe("wallet");
    expect(transaction.kind).toBe("TOP_UP");
    expect(transaction.idempotencyKey).toBe("key");
    expect(transaction.amount.toCents()).toBe(500);
    expect(transaction.occurredAt).toEqual(new Date("2026-10-01"));
  });

  test("constructor_WhenAmountIsZero_ThrowsDomainError", () => {
    // Input
    const details = transactionDetails({ amount: Money.fromCents(0) });

    // Log & Oracle
    expect(() => new LedgerTransaction(details)).toThrow(DomainError);
  });

  test("constructor_WhenAmountIsNegative_ThrowsDomainError", () => {
    // Input
    const details = transactionDetails({ amount: Money.fromCents(-1) });

    // Log & Oracle
    expect(() => new LedgerTransaction(details)).toThrow(DomainError);
  });

  test("constructor_WhenTransactionIdIsBlank_ThrowsDomainError", () => {
    // Input
    const details = transactionDetails({ transactionId: " " });

    // Log & Oracle
    expect(() => new LedgerTransaction(details)).toThrow(DomainError);
  });

  test("constructor_WhenIdempotencyKeyIsBlank_ThrowsDomainError", () => {
    // Input
    const details = transactionDetails({ idempotencyKey: " " });

    // Log & Oracle
    expect(() => new LedgerTransaction(details)).toThrow(DomainError);
  });

  test("constructor_WhenWalletIdIsBlank_ThrowsDomainError", () => {
    // Input
    const details = transactionDetails({ walletId: " " });

    // Log & Oracle
    expect(() => new LedgerTransaction(details)).toThrow(DomainError);
  });

  test("constructor_WhenHoldIdIsBlank_ThrowsDomainError", () => {
    // Input
    const details = transactionDetails({ holdId: " " });

    // Log & Oracle
    expect(() => new LedgerTransaction(details)).toThrow(DomainError);
  });

  test("constructor_WhenPayoutIdIsBlank_ThrowsDomainError", () => {
    // Input
    const details = transactionDetails({ payoutId: " " });

    // Log & Oracle
    expect(() => new LedgerTransaction(details)).toThrow(DomainError);
  });

  test("constructor_WhenExternalReferenceIsBlank_ThrowsDomainError", () => {
    // Input
    const details = transactionDetails({ externalReference: " " });

    // Log & Oracle
    expect(() => new LedgerTransaction(details)).toThrow(DomainError);
  });

  test("constructor_WhenKindIsUnknown_ThrowsDomainError", () => {
    // Input
    const details = transactionDetails({
      kind: "UNKNOWN" as LedgerTransactionDetails["kind"],
    });

    // Log & Oracle
    expect(() => new LedgerTransaction(details)).toThrow(DomainError);
  });

  test("constructor_WhenDateIsInvalid_ThrowsRangeError", () => {
    // Input
    const details = transactionDetails({ occurredAt: new Date(NaN) });

    // Log & Oracle
    expect(() => new LedgerTransaction(details)).toThrow(RangeError);
  });
});

function transactionDetails(
  overrides: Partial<LedgerTransactionDetails> = {},
): LedgerTransactionDetails {
  return {
    transactionId: "transaction",
    amount: Money.fromCents(500),
    kind: "TOP_UP",
    occurredAt: new Date("2026-10-01"),
    idempotencyKey: "key",
    walletId: "wallet",
    ...overrides,
  };
}
