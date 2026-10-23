import { describe, expect, test } from "vitest";
import { assertDeactivationAllowed, Money, type DeactivationInput } from "@/domain";

describe("Deactivation policy", () => {
  test("assertDeactivationAllowed_WhenNoObligationsRemain_AllowsDeactivation", () => {
    // Input
    const standing = clearStanding();

    // Log & Oracle
    expect(() => assertDeactivationAllowed(standing)).not.toThrow();
  });

  test("assertDeactivationAllowed_WhenFundsAreHeld_ThrowsActiveObligations", () => {
    // Input
    const standing = { ...clearStanding(), heldBalance: Money.fromCents(500) };

    // Log & Oracle
    expect(() => assertDeactivationAllowed(standing)).toThrow(
      expect.objectContaining({ code: "ACTIVE_OBLIGATIONS" }),
    );
  });

  test("assertDeactivationAllowed_WhenAnOwnedGroupIsActive_ThrowsActiveObligations", () => {
    // Input
    const standing = { ...clearStanding(), activeOwnedGroups: 1 };

    // Log & Oracle
    expect(() => assertDeactivationAllowed(standing)).toThrow(
      expect.objectContaining({ code: "ACTIVE_OBLIGATIONS" }),
    );
  });

  test("assertDeactivationAllowed_WhenBalanceIsNegative_ThrowsInvalidInput", () => {
    // Input
    const standing = { ...clearStanding(), availableBalance: Money.fromCents(-1) };

    // Log & Oracle
    expect(() => assertDeactivationAllowed(standing)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("assertDeactivationAllowed_WhenObligationCountIsFractional_ThrowsInvalidInput", () => {
    // Input
    const standing = { ...clearStanding(), activeCommitments: 0.5 };

    // Log & Oracle
    expect(() => assertDeactivationAllowed(standing)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });
});

function clearStanding(): DeactivationInput {
  return {
    availableBalance: Money.fromCents(0),
    heldBalance: Money.fromCents(0),
    activeCommitments: 0,
    unsettledOwnedSessions: 0,
    pendingPayouts: 0,
    activeOwnedGroups: 0,
  };
}
