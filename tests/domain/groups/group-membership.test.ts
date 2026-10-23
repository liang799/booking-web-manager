import { DomainError, GroupMembership } from "@/domain";
import { describe, expect, test } from "vitest";

describe("GroupMembership", () => {
  test("constructor_WhenDateIsInvalid_ThrowsDomainError", () => {
    // Input
    const details = { userId: "owner", joinedAt: new Date("invalid") };

    // Log & Oracle
    expect(() => new GroupMembership(details)).toThrow(DomainError);
  });

  test("constructor_WhenUserIdIsBlank_ThrowsDomainError", () => {
    // Input
    const details = { userId: " ", joinedAt: now() };

    // Log & Oracle
    expect(() => new GroupMembership(details)).toThrow(DomainError);
  });

  test("joinedAt_WhenSourceAndExposedDatesAreMutated_PreservesTimestamp", () => {
    // Input
    const joinedAt = now();
    const membership = new GroupMembership({ userId: "owner", joinedAt });

    // Attempt to alter the supplied and returned dates.
    joinedAt.setUTCFullYear(2000);
    membership.joinedAt.setUTCFullYear(2000);

    // Log
    const storedJoinedAt = membership.joinedAt;

    // Oracle
    expect(storedJoinedAt).toEqual(new Date("2026-09-15T00:00:00Z"));
  });
});

function now() {
  return new Date("2026-09-15T00:00:00Z");
}
