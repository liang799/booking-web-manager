import {
  DomainError,
  LedgerTransaction,
  type LedgerTransactionDetails,
  Money,
  Wallet,
  type WalletDetails,
} from "@/domain";
import { describe, expect, test } from "vitest";

describe("Wallet funds and history integrity", () => {
  describe("Wallet identity and history isolation", () => {
    test("constructor_WhenInputIdentityIsMutated_PreservesWalletIdentity", () => {
      const input = { walletId: "wallet", userId: "owner", transactions: [] };
      const wallet = new Wallet(input);

      // Attempt to alter the supplied identity.
      input.walletId = "changed";
      input.userId = "changed";
      const identityChanged = Reflect.set(wallet, "walletId", "changed");

      expect(wallet.walletId).toBe("wallet");
      expect(wallet.userId).toBe("owner");
      expect(identityChanged).toBe(false);
    });

    test("constructor_WhenWalletIdIsBlank_ThrowsDomainError", () => {
      const details = { walletId: " ", userId: "owner", transactions: [] };

      expect(() => new Wallet(details)).toThrow(DomainError);
    });

    test("constructor_WhenUserIdIsBlank_ThrowsDomainError", () => {
      const details = { walletId: "wallet", userId: " ", transactions: [] };

      expect(() => new Wallet(details)).toThrow(DomainError);
    });

    test("transactions_WhenInputsAndOutputsAreMutated_PreservesHistoryAndFunds", () => {
      const credit = entry("credit", "TOP_UP", 700);
      const history = [credit];
      const fundedWallet = wallet(history);

      // Attempt to alter supplied and returned transaction data.
      history.length = 0;
      (fundedWallet.transactions as LedgerTransaction[]).push(
        entry("extra", "TOP_UP", 100),
      );
      credit.occurredAt.setTime(0);
      const amountChanged = Reflect.set(credit, "amount", Money.fromCents(0));
      const storedTransactions = fundedWallet.transactions;

      expect(amountChanged).toBe(false);
      expect(storedTransactions).toEqual([credit]);
      expect(storedTransactions[0]?.occurredAt.toISOString()).toBe(
        "2026-10-01T10:00:00.000Z",
      );
      expect(fundedWallet.getAvailableBalance().toCents()).toBe(700);
    });
  });

  describe("Transaction history integrity", () => {
    test("constructor_WhenHistoryIsMissing_ThrowsInvalidInput", () => {
      const details = {
        walletId: "wallet",
        userId: "owner",
        transactions: undefined,
      } as unknown as WalletDetails;

      expect(() => new Wallet(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenHistoryIsNull_ThrowsInvalidInput", () => {
      const details = {
        walletId: "wallet",
        userId: "owner",
        transactions: null,
      } as unknown as WalletDetails;

      expect(() => new Wallet(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenHistoryIsNotAnArray_ThrowsInvalidInput", () => {
      const details = {
        walletId: "wallet",
        userId: "owner",
        transactions: new Set(),
      } as unknown as WalletDetails;

      expect(() => new Wallet(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenEntryBelongsToAnotherWallet_ThrowsInvalidInput", () => {
      const details = {
        walletId: "wallet",
        userId: "owner",
        transactions: [entry("foreign", "TOP_UP", 100, { walletId: "other" })],
      };

      expect(() => new Wallet(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenEntryHasNoWallet_ThrowsInvalidInput", () => {
      const details = {
        walletId: "wallet",
        userId: "owner",
        transactions: [
          entry("unassigned", "TOP_UP", 100, { walletId: undefined }),
        ],
      };

      expect(() => new Wallet(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenTransactionIdsAreDuplicated_ThrowsInvalidInput", () => {
      const details = {
        walletId: "wallet",
        userId: "owner",
        transactions: [
          entry("same", "TOP_UP", 100),
          entry("same", "REFUND", 100),
        ],
      };

      expect(() => new Wallet(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });
  });

  describe("Available funds", () => {
    test("constructor_WhenBalanceWouldBeNegative_ThrowsInvalidInput", () => {
      const history = [
        entry("credit", "TOP_UP", 500),
        entry("debit", "LOCK", 501),
      ];

      expect(() => wallet(history)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenFundsExceedSafeIntegerRange_ThrowsRangeError", () => {
      const history = [
        entry("credit", "TOP_UP", Number.MAX_SAFE_INTEGER),
        entry("overflow", "TOP_UP", 1),
      ];

      expect(() => wallet(history)).toThrow(RangeError);
    });

    test("getAvailableBalance_WhenHistoryIsEmpty_ReturnsZero", () => {
      const emptyWallet = wallet([]);

      const funds = emptyWallet.getAvailableBalance();

      expect(funds.toCents()).toBe(0);
    });

    test("getAvailableBalance_WhenHistoryIncludesTopUp_ReturnsSpendableBalance", () => {
      const fundedWallet = wallet([
        entry("initial", "TOP_UP", 1_000),
        entry("movement", "TOP_UP", 200),
      ]);

      const funds = fundedWallet.getAvailableBalance();

      expect(funds.toCents()).toBe(1200);
    });

    test("getAvailableBalance_WhenHistoryIncludesRefund_ReturnsSpendableBalance", () => {
      const fundedWallet = wallet([
        entry("initial", "TOP_UP", 1_000),
        entry("movement", "REFUND", 200),
      ]);

      const funds = fundedWallet.getAvailableBalance();

      expect(funds.toCents()).toBe(1200);
    });

    test("getAvailableBalance_WhenHistoryIncludesLock_ReturnsSpendableBalance", () => {
      const fundedWallet = wallet([
        entry("initial", "TOP_UP", 1_000),
        entry("movement", "LOCK", 200),
      ]);

      const funds = fundedWallet.getAvailableBalance();

      expect(funds.toCents()).toBe(800);
    });

    test("getAvailableBalance_WhenHistoryIncludesPayout_ReturnsSpendableBalance", () => {
      const fundedWallet = wallet([
        entry("initial", "TOP_UP", 1_000),
        entry("movement", "PAYOUT", 200),
      ]);

      const funds = fundedWallet.getAvailableBalance();

      expect(funds.toCents()).toBe(800);
    });

    test("getAvailableBalance_WhenHistoryIncludesRelease_ReturnsSpendableBalance", () => {
      const fundedWallet = wallet([
        entry("initial", "TOP_UP", 1_000),
        entry("movement", "RELEASE", 200),
      ]);

      const funds = fundedWallet.getAvailableBalance();

      expect(funds.toCents()).toBe(1000);
    });

    test("getAvailableBalance_WhenHistoryIncludesForfeit_ReturnsSpendableBalance", () => {
      const fundedWallet = wallet([
        entry("initial", "TOP_UP", 1_000),
        entry("movement", "FORFEIT", 200),
      ]);

      const funds = fundedWallet.getAvailableBalance();

      expect(funds.toCents()).toBe(1000);
    });

    test("getAvailableBalance_WhenHoldsAreRefundedReleasedOrForfeited_AppliesEachMovementOnce", () => {
      const fundedWallet = wallet([
        entry("top-up", "TOP_UP", 1_000),
        entry("lock-refunded", "LOCK", 200),
        entry("refund", "REFUND", 200),
        entry("lock-released", "LOCK", 300),
        entry("release", "RELEASE", 300),
        entry("lock-forfeited", "LOCK", 100),
        entry("forfeit", "FORFEIT", 100),
        entry("withdrawal", "PAYOUT", 150),
      ]);

      const funds = fundedWallet.getAvailableBalance();

      expect(funds.toCents()).toBe(450);
    });

    test("getAvailableBalance_WhenExactAvailableAmountIsSpent_ReturnsZero", () => {
      const fundedWallet = wallet([
        entry("credit", "TOP_UP", 500),
        entry("debit", "LOCK", 500),
      ]);

      const funds = fundedWallet.getAvailableBalance();

      expect(funds.toCents()).toBe(0);
    });

    test("getAvailableBalance_WhenTransactionOrderChanges_PreservesExactBalance", () => {
      const history = [
        entry("credit", "TOP_UP", Number.MAX_SAFE_INTEGER),
        entry("extra", "TOP_UP", 1),
        entry("debit", "PAYOUT", Number.MAX_SAFE_INTEGER),
      ];

      const forwardFunds = wallet(history).getAvailableBalance();
      const reversedFunds = wallet([...history].reverse()).getAvailableBalance();

      expect(forwardFunds.toCents()).toBe(1);
      expect(reversedFunds.toCents()).toBe(1);
    });
  });
});

function entry(
  transactionId: string,
  kind: LedgerTransactionDetails["kind"],
  cents: number,
  overrides: Partial<LedgerTransactionDetails> = {},
): LedgerTransaction {
  return new LedgerTransaction({
    transactionId,
    walletId: "wallet",
    kind,
    amount: Money.fromCents(cents),
    occurredAt: new Date("2026-10-01T10:00:00Z"),
    idempotencyKey: transactionId,
    ...overrides,
  });
}

function wallet(transactions: readonly LedgerTransaction[]): Wallet {
  return new Wallet({ walletId: "wallet", userId: "owner", transactions });
}
