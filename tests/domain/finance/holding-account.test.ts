import { DomainError, HoldingAccount } from "@/domain";
import { describe, expect, test } from "vitest";

describe("Holding account identity", () => {
  test("constructor_WhenIdentityIsValid_PreservesAccountId", () => {
    const details = { accountId: "platform" };

    const account = new HoldingAccount(details);

    expect(account.accountId).toBe("platform");
  });

  test("constructor_WhenAccountIdIsBlank_ThrowsDomainError", () => {
    const details = { accountId: " " };

    expect(() => new HoldingAccount(details)).toThrow(DomainError);
  });
});
