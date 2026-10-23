import {
  Email,
  ReliabilityScore,
  User,
  type UserDetails,
  Wallet,
} from "@/domain";
import { describe, expect, test } from "vitest";
import {
  fundedWallet,
  createTestUserDetails,
  userLoadedAt,
} from "./user-fixtures";

describe("User", () => {
  test("constructor_WhenMembershipsAreMissing_ThrowsInvalidInput", () => {
    // Input
    const details = {
      ...createTestUserDetails({ userId: "alice" }),
      memberGroupIds: undefined,
    } as unknown as UserDetails;

    // Log & Oracle
    expect(() => new User(details)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenMembershipsAreNull_ThrowsInvalidInput", () => {
    // Input
    const details = {
      ...createTestUserDetails({ userId: "alice" }),
      memberGroupIds: null,
    } as unknown as UserDetails;

    // Log & Oracle
    expect(() => new User(details)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenWalletBelongsToAnotherUser_ThrowsInvalidInput", () => {
    // Input
    const details = {
      ...createTestUserDetails({ userId: "alice" }),
      wallet: new Wallet({
        walletId: "w-alice",
        userId: "other",
        transactions: [],
      }),
    };

    // Log & Oracle
    expect(() => new User(details)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenMembershipIdIsBlank_ThrowsInvalidInput", () => {
    // Input
    const details = {
      ...createTestUserDetails({ userId: "alice" }),
      memberGroupIds: [" "],
    };

    // Log & Oracle
    expect(() => new User(details)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenMembershipsAreNotAnArray_ThrowsInvalidInput", () => {
    // Input
    const details = {
      ...createTestUserDetails({ userId: "alice" }),
      memberGroupIds: new Set(["group"]),
    } as unknown as UserDetails;

    // Log & Oracle
    expect(() => new User(details)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenSourceDataChanges_PreservesLoadedValues", () => {
    // Input
    const wallet = fundedWallet("alice", 700);
    const reliabilityScore = ReliabilityScore.from(80);
    const memberGroupIds = ["group"];
    const details = {
      ...createTestUserDetails({ userId: "alice" }),
      wallet,
      reliabilityScore,
      memberGroupIds,
    };
    const user = new User(details);

    // Log
    details.wallet = fundedWallet("alice", 0);
    details.reliabilityScore = ReliabilityScore.from(0);
    memberGroupIds.push("other");

    // Oracle
    expect(user.wallet).toBe(wallet);
    expect(user.wallet.walletId).toBe("w-alice");
    expect(user.wallet.getAvailableBalance().toCents()).toBe(700);
    expect(user.reliabilityScore).toBe(reliabilityScore);
    expect(user.reliabilityScore.toNumber()).toBe(80);
    expect(user.memberGroupIds).toEqual(["group"]);
  });

  test("memberGroupIds_WhenReturnedArrayChanges_PreservesMemberships", () => {
    // Input
    const user = new User(
      createTestUserDetails({
        userId: "alice",
        memberGroupIds: ["group"],
      }),
    );
    const memberships = user.memberGroupIds as string[];

    // Log
    memberships.push("injected");

    // Oracle
    expect(user.memberGroupIds).toEqual(["group"]);
  });

  test("wallet_WhenReassignmentIsAttempted_PreservesLoadedWallet", () => {
    // Input
    const wallet = fundedWallet("alice", 700);
    const user = new User(createTestUserDetails({ userId: "alice", wallet }));
    const replacement = fundedWallet("alice", 0);

    // Log
    const walletReassigned = Reflect.set(user, "wallet", replacement);

    // Oracle
    expect(walletReassigned).toBe(false);
    expect(user.wallet).toBe(wallet);
    expect(user.wallet.getAvailableBalance().toCents()).toBe(700);
  });

  test("reliabilityScore_WhenReassignmentIsAttempted_PreservesLoadedScore", () => {
    // Input
    const reliabilityScore = ReliabilityScore.from(80);
    const user = new User(
      createTestUserDetails({ userId: "alice", reliabilityScore }),
    );
    const replacement = ReliabilityScore.from(0);

    // Log
    const scoreReassigned = Reflect.set(user, "reliabilityScore", replacement);

    // Oracle
    expect(scoreReassigned).toBe(false);
    expect(user.reliabilityScore).toBe(reliabilityScore);
    expect(user.reliabilityScore.toNumber()).toBe(80);
  });

  test("create_WhenRegistering_EstablishesWalletAndEmptyHistory", () => {
    // Input
    const details = {
      userId: "new-user",
      email: new Email("new@example.com"),
      walletId: "new-wallet",
      now: userLoadedAt,
    };

    // Log
    const user = User.create(details);

    // Oracle
    expect(user.userId).toBe("new-user");
    expect(user.wallet.userId).toBe("new-user");
    expect(user.email?.toString()).toBe("new@example.com");
    expect(user.wallet.walletId).toBe("new-wallet");
    expect(user.wallet.transactions).toEqual([]);
    expect(user.wallet.getAvailableBalance().toCents()).toBe(0);
    expect(user.reliabilityScore.toNumber()).toBe(100);
    expect(user.memberGroupIds).toEqual([]);
  });
});
