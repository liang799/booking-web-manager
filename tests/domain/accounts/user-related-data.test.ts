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
    const details = {
      ...createTestUserDetails({ userId: "alice" }),
      memberGroupIds: undefined,
    } as unknown as UserDetails;

    expect(() => new User(details)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenMembershipsAreNull_ThrowsInvalidInput", () => {
    const details = {
      ...createTestUserDetails({ userId: "alice" }),
      memberGroupIds: null,
    } as unknown as UserDetails;

    expect(() => new User(details)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenWalletBelongsToAnotherUser_ThrowsInvalidInput", () => {
    const details = {
      ...createTestUserDetails({ userId: "alice" }),
      wallet: new Wallet({
        walletId: "w-alice",
        userId: "other",
        transactions: [],
      }),
    };

    expect(() => new User(details)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenMembershipIdIsBlank_ThrowsInvalidInput", () => {
    const details = {
      ...createTestUserDetails({ userId: "alice" }),
      memberGroupIds: [" "],
    };

    expect(() => new User(details)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenMembershipsAreNotAnArray_ThrowsInvalidInput", () => {
    const details = {
      ...createTestUserDetails({ userId: "alice" }),
      memberGroupIds: new Set(["group"]),
    } as unknown as UserDetails;

    expect(() => new User(details)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenSourceDataChanges_PreservesLoadedValues", () => {
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

    // Attempt to alter the supplied objects and membership list.
    details.wallet = fundedWallet("alice", 0);
    details.reliabilityScore = ReliabilityScore.from(0);
    memberGroupIds.push("other");
    const loadedWallet = user.wallet;
    const loadedScore = user.reliabilityScore;

    expect(loadedWallet).toBe(wallet);
    expect(loadedWallet.walletId).toBe("w-alice");
    expect(loadedWallet.getAvailableBalance().toCents()).toBe(700);
    expect(loadedScore).toBe(reliabilityScore);
    expect(loadedScore.toNumber()).toBe(80);
    expect(user.memberGroupIds).toEqual(["group"]);
  });

  test("memberGroupIds_WhenReturnedArrayChanges_PreservesMemberships", () => {
    const user = new User(
      createTestUserDetails({
        userId: "alice",
        memberGroupIds: ["group"],
      }),
    );
    const memberships = user.memberGroupIds as string[];

    // Attempt to alter the returned collection.
    memberships.push("injected");

    expect(user.memberGroupIds).toEqual(["group"]);
  });

  test("wallet_WhenReassignmentIsAttempted_PreservesLoadedWallet", () => {
    const wallet = fundedWallet("alice", 700);
    const user = new User(createTestUserDetails({ userId: "alice", wallet }));
    const replacement = fundedWallet("alice", 0);

    const walletReassigned = Reflect.set(user, "wallet", replacement);
    const retainedWallet = user.wallet;

    expect(walletReassigned).toBe(false);
    expect(retainedWallet).toBe(wallet);
    expect(retainedWallet.getAvailableBalance().toCents()).toBe(700);
  });

  test("reliabilityScore_WhenReassignmentIsAttempted_PreservesLoadedScore", () => {
    const reliabilityScore = ReliabilityScore.from(80);
    const user = new User(
      createTestUserDetails({ userId: "alice", reliabilityScore }),
    );
    const replacement = ReliabilityScore.from(0);

    const scoreReassigned = Reflect.set(user, "reliabilityScore", replacement);
    const retainedScore = user.reliabilityScore;

    expect(scoreReassigned).toBe(false);
    expect(retainedScore).toBe(reliabilityScore);
    expect(retainedScore.toNumber()).toBe(80);
  });

  test("create_WhenRegistering_EstablishesWalletAndEmptyHistory", () => {
    const details = {
      userId: "new-user",
      email: new Email("new@example.com"),
      walletId: "new-wallet",
      now: userLoadedAt,
    };

    const user = User.create(details);

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
