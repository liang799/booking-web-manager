import {
  DomainError,
  LedgerTransaction,
  type LedgerTransactionDetails,
  Money,
} from "@/domain";
import { describe, expect, test } from "vitest";

describe("LedgerTransaction", () => {
  test("constructor_WhenDatesAreMutated_PreservesFinancialFact", () => {
    const input = transactionDetails();
    const transaction = new LedgerTransaction(input);

    // Attempt to alter the supplied and returned transaction dates.
    input.occurredAt.setTime(0);
    transaction.occurredAt.setTime(0);

    expect(transaction.transactionId).toBe("transaction");
    expect(transaction.walletId).toBe("wallet");
    expect(transaction.kind).toBe("TOP_UP");
    expect(transaction.idempotencyKey).toBe("key");
    expect(transaction.amount.toCents()).toBe(500);
    expect(transaction.occurredAt).toEqual(new Date("2026-10-01"));
  });

  test("constructor_WhenAmountIsZero_ThrowsDomainError", () => {
    const details = transactionDetails({ amount: Money.fromCents(0) });

    expect(() => new LedgerTransaction(details)).toThrow(DomainError);
  });

  test("constructor_WhenAmountIsNegative_ThrowsDomainError", () => {
    const details = transactionDetails({ amount: Money.fromCents(-1) });

    expect(() => new LedgerTransaction(details)).toThrow(DomainError);
  });

  test("constructor_WhenTransactionIdIsBlank_ThrowsDomainError", () => {
    const details = transactionDetails({ transactionId: " " });

    expect(() => new LedgerTransaction(details)).toThrow(DomainError);
  });

  test("constructor_WhenIdempotencyKeyIsBlank_ThrowsDomainError", () => {
    const details = transactionDetails({ idempotencyKey: " " });

    expect(() => new LedgerTransaction(details)).toThrow(DomainError);
  });

  test("constructor_WhenWalletIdIsBlank_ThrowsDomainError", () => {
    const details = transactionDetails({ walletId: " " });

    expect(() => new LedgerTransaction(details)).toThrow(DomainError);
  });

  test("constructor_WhenHoldIdIsBlank_ThrowsDomainError", () => {
    const details = transactionDetails({ holdId: " " });

    expect(() => new LedgerTransaction(details)).toThrow(DomainError);
  });

  test("constructor_WhenPayoutIdIsBlank_ThrowsDomainError", () => {
    const details = transactionDetails({ payoutId: " " });

    expect(() => new LedgerTransaction(details)).toThrow(DomainError);
  });

  test("constructor_WhenExternalReferenceIsBlank_ThrowsDomainError", () => {
    const details = transactionDetails({ externalReference: " " });

    expect(() => new LedgerTransaction(details)).toThrow(DomainError);
  });

  test("constructor_WhenKindIsUnknown_ThrowsDomainError", () => {
    const details = transactionDetails({
      kind: "UNKNOWN" as LedgerTransactionDetails["kind"],
    });

    expect(() => new LedgerTransaction(details)).toThrow(DomainError);
  });

  test("constructor_WhenDateIsInvalid_ThrowsRangeError", () => {
    const details = transactionDetails({ occurredAt: new Date(NaN) });

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
