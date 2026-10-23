import { PayoutAccount, type PayoutAccountDetails } from "@/domain";
import { describe, expect, test } from "vitest";

describe("PayoutAccount", () => {
  test("constructor_WhenCompletedWithBankDetails_RestoresCompletedAccount", () => {
    // Input
    const details = payoutAccountDetails({
      setupStatus: "COMPLETE",
      bankAccountReference: "bank",
    });

    // Log
    const account = new PayoutAccount(details);

    // Oracle
    expect(account.setupStatus).toBe("COMPLETE");
    expect(account.bankAccountReference).toBe("bank");
  });

  test("constructor_WhenCompletedWithoutBankDetails_ThrowsInvalidInput", () => {
    // Input
    const details = payoutAccountDetails({ setupStatus: "COMPLETE" });

    // Log & Oracle
    expect(() => new PayoutAccount(details)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenPendingWithBankDetails_ThrowsInvalidInput", () => {
    // Input
    const details = payoutAccountDetails({ bankAccountReference: "bank" });

    // Log & Oracle
    expect(() => new PayoutAccount(details)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("completeSetup_WhenSetupIsPending_ReturnsCompletedCopy", () => {
    // Input
    const pendingAccount = new PayoutAccount(payoutAccountDetails());

    // Log
    const completedAccount = pendingAccount.completeSetup("bank");

    // Oracle
    expect(completedAccount).not.toBe(pendingAccount);
    expect(pendingAccount.setupStatus).toBe("PENDING");
    expect(pendingAccount.bankAccountReference).toBeUndefined();
    expect(completedAccount.setupStatus).toBe("COMPLETE");
    expect(completedAccount.bankAccountReference).toBe("bank");
  });

  test("completeSetup_WhenConfirmationMatches_ReturnsSameCompletedAccount", () => {
    // Input
    const pendingAccount = new PayoutAccount(payoutAccountDetails());
    const completedAccount = pendingAccount.completeSetup("bank");

    // Log
    const repeatedConfirmation = completedAccount.completeSetup("bank");

    // Oracle
    expect(repeatedConfirmation).toBe(completedAccount);
  });

  test("completeSetup_WhenRestoredConfirmationMatches_ReturnsSameCompletedAccount", () => {
    // Input
    const restoredAccount = new PayoutAccount(
      payoutAccountDetails({
        setupStatus: "COMPLETE",
        bankAccountReference: "bank",
      }),
    );

    // Log
    const repeatedConfirmation = restoredAccount.completeSetup("bank");

    // Oracle
    expect(repeatedConfirmation).toBe(restoredAccount);
  });

  test("completeSetup_WhenSetupHasFailed_ThrowsInvalidState", () => {
    // Input
    const pendingAccount = new PayoutAccount(payoutAccountDetails());
    const failedAccount = pendingAccount.failSetup();

    // Log & Oracle
    expect(() => failedAccount.completeSetup("bank")).toThrow(
      expect.objectContaining({ code: "INVALID_STATE" }),
    );
  });
});

function payoutAccountDetails(
  overrides: Partial<PayoutAccountDetails> = {},
): PayoutAccountDetails {
  return {
    payoutAccountId: "account",
    userId: "owner",
    providerAccountReference: "provider",
    setupStatus: "PENDING",
    ...overrides,
  };
}
