import { DomainError, HoldingAccount } from "@/domain";
import { describe, expect, test } from "vitest";

describe("HoldingAccount", () => {
  test("constructor_WhenIdentityIsValid_PreservesAccountId", () => {
    // Input
    const details = { accountId: "platform" };

    // Log
    const account = new HoldingAccount(details);

    // Oracle
    expect(account.accountId).toBe("platform");
  });

  test("constructor_WhenAccountIdIsBlank_ThrowsDomainError", () => {
    // Input
    const details = { accountId: " " };

    // Log & Oracle
    expect(() => new HoldingAccount(details)).toThrow(DomainError);
  });
});
