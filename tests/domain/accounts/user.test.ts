import {
  type DeactivationInput,
  Email,
  Money,
  PayoutAccount,
  User,
} from "@/domain";
import { describe, expect, test } from "vitest";
import { createTestUserDetails, userLoadedAt } from "./user-fixtures";

describe("User", () => {
  describe("Construction and registration", () => {
    test("constructor_WhenVerifiedEmailIsMissing_ThrowsInvalidInput", () => {
      // Input
      const details = createTestUserDetails({ userId: "owner", email: null, emailVerified: true });

      // Log & Oracle
      expect(() => new User(details)).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("constructor_WhenEmailIsProvided_PreservesTheEmailValue", () => {
      // Input
      const email = new Email("Owner+bookings@Example.COM");
      const details = createTestUserDetails({ userId: "owner", email });

      // Log
      const user = new User(details);

      // Oracle
      expect(user.email).toBe(email);
      expect(user.email?.toString()).toBe("Owner+bookings@Example.COM");
    });

    test("constructor_WhenActiveAccountHasNoEmail_LoadsAnUnverifiedAccount", () => {
      // Input
      const details = createTestUserDetails({
        userId: "owner",
        email: null,
        emailVerified: false,
      });

      // Log
      const user = new User(details);

      // Oracle
      expect(user.accountStatus).toBe("ACTIVE");
      expect(user.email).toBeNull();
      expect(user.emailVerified).toBe(false);
    });

    test("constructor_WhenInactiveAccountHasEmail_ThrowsInvalidInput", () => {
      // Input
      const details = createTestUserDetails({
        userId: "owner",
        accountStatus: "INACTIVE",
        email: new Email("owner@example.com"),
      });

      // Log & Oracle
      expect(() => new User(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenLoadingDeactivatedUser_RestoresAnonymisedProfile", () => {
      // Input
      const original = createActiveUser();
      original.beginPayoutSetup({
        payoutAccountId: "account",
        providerAccountReference: "provider",
      });
      original.completePayoutSetup("bank");
      original.deactivate(deactivationWithoutObligations());
      const details = createTestUserDetails({
        userId: "owner",
        accountStatus: "INACTIVE",
        email: null,
        payoutAccount: original.payoutAccount,
      });

      // Log
      const restored = new User(details);
      const restoredState = accountStateOf(restored);

      // Oracle
      expect(restored.accountStatus).toBe("INACTIVE");
      expect(restored.email).toBeNull();
      expect(restoredState).toEqual(accountStateOf(original));
    });

    test("constructor_WhenPayoutAccountBelongsToAnotherUser_ThrowsInvalidInput", () => {
      // Input
      const payoutAccount = PayoutAccount.create({
        payoutAccountId: "account",
        userId: "other-user",
        providerAccountReference: "provider",
      });
      const details = createTestUserDetails({ userId: "owner", payoutAccount });

      // Log & Oracle
      expect(() => new User(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenSourcePreferencesChange_PreservesStoredPreferences", () => {
      // Input
      const sports = new Set(["Tennis"]);
      const regions = new Set(["West"]);
      const user = new User(
        createTestUserDetails({
          userId: "owner",
          preferredSports: sports,
          preferredRegions: regions,
        }),
      );

      // Log
      // Attempt to alter the supplied preference sets.
      sports.clear();
      regions.clear();
      const storedSports = [...user.preferredSports];
      const storedRegions = [...user.preferredRegions];

      // Oracle
      expect(storedSports).toEqual(["Tennis"]);
      expect(storedRegions).toEqual(["West"]);
    });

    test("create_WhenRegistrationIsValid_ReturnsAnActiveUser", () => {
      // Input
      const email = new Email("owner@example.com");

      // Log
      const user = User.create({
        userId: "owner",
        email,
        walletId: "w-owner",
        now: userLoadedAt,
      });

      // Oracle
      expect(user.accountStatus).toBe("ACTIVE");
      expect(user.email).toBe(email);
      expect(user.emailVerified).toBe(false);
    });

    test("create_WhenSourcePreferencesChange_PreservesStoredPreferences", () => {
      // Input
      const sports = new Set(["Tennis"]);
      const regions = new Set(["West"]);
      const user = User.create({
        userId: "owner",
        email: new Email("owner@example.com"),
        walletId: "w-owner",
        now: userLoadedAt,
        preferredSports: sports,
        preferredRegions: regions,
      });

      // Log
      // Attempt to alter the supplied preference sets.
      sports.clear();
      regions.clear();
      const storedSports = [...user.preferredSports];
      const storedRegions = [...user.preferredRegions];

      // Oracle
      expect(storedSports).toEqual(["Tennis"]);
      expect(storedRegions).toEqual(["West"]);
    });
  });

  describe("Profile and preferences", () => {
    test("updateProfile_WhenVerifiedEmailChanges_RequiresFreshVerification", () => {
      // Input
      const user = new User(createTestUserDetails({ userId: "owner", emailVerified: true }));

      // Log
      user.updateProfile({ email: new Email("new@example.com") });
      const emailVerified = user.emailVerified;

      // Oracle
      expect(emailVerified).toBe(false);
    });

    test("updateProfile_WhenVerifiedEmailIsUnchanged_PreservesVerification", () => {
      // Input
      const user = new User(createTestUserDetails({ userId: "owner", emailVerified: true }));

      // Log
      user.updateProfile({ email: new Email("owner@example.com") });
      const emailVerified = user.emailVerified;

      // Oracle
      expect(emailVerified).toBe(true);
    });

    test("updateProfile_WhenAccountIsActive_ReplacesEmail", () => {
      // Input
      const user = createActiveUser();
      const email = new Email("new@example.com");

      // Log
      user.updateProfile({ email });
      const updatedEmail = user.email;

      // Oracle
      expect(updatedEmail).toBe(email);
      expect(updatedEmail?.toString()).toBe("new@example.com");
    });

    test("updateProfile_WhenAccountIsInactive_RejectsWithoutChangingState", () => {
      // Input
      const user = createActiveUser();
      user.deactivate(deactivationWithoutObligations());
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() =>
        user.updateProfile({ email: new Email("new@example.com") }),
      ).toThrow(expect.objectContaining({ code: "INACTIVE_ACCOUNT" }));

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("updatePreferences_WhenPreferencesAreValid_ReplacesSportsAndRegions", () => {
      // Input
      const user = createActiveUser();

      // Log
      user.updatePreferences({
        preferredSports: new Set(["Tennis"]),
        preferredRegions: new Set(["West"]),
      });
      const updatedSports = [...user.preferredSports];
      const updatedRegions = [...user.preferredRegions];

      // Oracle
      expect(updatedSports).toEqual(["Tennis"]);
      expect(updatedRegions).toEqual(["West"]);
    });

    test("updatePreferences_WhenRegionIsBlank_RejectsWithoutChangingState", () => {
      // Input
      const user = createActiveUser();
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() =>
        user.updatePreferences({
          preferredSports: new Set(["Tennis"]),
          preferredRegions: new Set([" "]),
        }),
      ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("updatePreferences_WhenAccountIsInactive_RejectsWithoutChangingState", () => {
      // Input
      const user = createActiveUser();
      user.deactivate(deactivationWithoutObligations());
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() =>
        user.updatePreferences({
          preferredSports: new Set(["Tennis"]),
          preferredRegions: new Set(["West"]),
        }),
      ).toThrow(expect.objectContaining({ code: "INACTIVE_ACCOUNT" }));

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("preferredSports_WhenReturnedSetChanges_PreservesStoredPreferences", () => {
      // Input
      const user = new User(
        createTestUserDetails({
          userId: "owner",
          preferredSports: new Set(["Tennis"]),
        }),
      );
      const exposedSports = user.preferredSports as Set<string>;

      // Log
      // Attempt to alter the returned preference set.
      exposedSports.clear();
      const storedSports = [...user.preferredSports];

      // Oracle
      expect(storedSports).toEqual(["Tennis"]);
    });

    test("preferredRegions_WhenReturnedSetChanges_PreservesStoredPreferences", () => {
      // Input
      const user = new User(
        createTestUserDetails({
          userId: "owner",
          preferredRegions: new Set(["West"]),
        }),
      );
      const exposedRegions = user.preferredRegions as Set<string>;

      // Log
      // Attempt to alter the returned preference set.
      exposedRegions.clear();
      const storedRegions = [...user.preferredRegions];

      // Oracle
      expect(storedRegions).toEqual(["West"]);
    });
  });

  describe("Payout setup", () => {
    test("beginPayoutSetup_WhenNoSetupExists_CreatesPendingAccount", () => {
      // Input
      const user = createActiveUser();

      // Log
      user.beginPayoutSetup({
        payoutAccountId: "account",
        providerAccountReference: "provider",
      });
      const pendingAccount = user.payoutAccount;

      // Oracle
      expect(pendingAccount?.setupStatus).toBe("PENDING");
      expect(pendingAccount?.payoutAccountId).toBe("account");
      expect(pendingAccount?.userId).toBe("owner");
    });

    test("beginPayoutSetup_WhenSetupIsPending_ThrowsInvalidState", () => {
      // Input
      const user = createActiveUser();
      user.beginPayoutSetup({
        payoutAccountId: "account",
        providerAccountReference: "provider",
      });
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() =>
        user.beginPayoutSetup({
          payoutAccountId: "replacement",
          providerAccountReference: "other-provider",
        }),
      ).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("beginPayoutSetup_WhenSetupIsComplete_ThrowsInvalidState", () => {
      // Input
      const user = createActiveUser();
      user.beginPayoutSetup({
        payoutAccountId: "account",
        providerAccountReference: "provider",
      });
      user.completePayoutSetup("bank");
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() =>
        user.beginPayoutSetup({
          payoutAccountId: "replacement",
          providerAccountReference: "other-provider",
        }),
      ).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("beginPayoutSetup_WhenPreviousSetupFailed_AllowsReplacementToComplete", () => {
      // Input
      const user = createActiveUser();
      user.beginPayoutSetup({
        payoutAccountId: "account",
        providerAccountReference: "provider",
      });
      user.failPayoutSetup();

      // Log
      user.beginPayoutSetup({
        payoutAccountId: "replacement",
        providerAccountReference: "other-provider",
      });
      user.completePayoutSetup("replacement-bank");
      const completedAccount = user.payoutAccount;
      const destination = user.payoutDestination();

      // Oracle
      expect(completedAccount?.setupStatus).toBe("COMPLETE");
      expect(destination.payoutAccountId).toBe("replacement");
      expect(destination.bankAccountReference).toBe("replacement-bank");
    });

    test("completePayoutSetup_WhenSetupIsPending_ReplacesAccountWithCompletedCopy", () => {
      // Input
      const user = createActiveUser();
      user.beginPayoutSetup({
        payoutAccountId: "account",
        providerAccountReference: "provider",
      });
      const pendingAccount = user.payoutAccount;

      // Log
      user.completePayoutSetup("bank");
      const completedAccount = user.payoutAccount;
      const originalStatus = pendingAccount?.setupStatus;

      // Oracle
      expect(originalStatus).toBe("PENDING");
      expect(completedAccount).not.toBe(pendingAccount);
      expect(completedAccount?.setupStatus).toBe("COMPLETE");
      expect(completedAccount?.bankAccountReference).toBe("bank");
    });

    test("completePayoutSetup_WhenNoSetupExists_ThrowsPayoutAccountNotReady", () => {
      // Input
      const user = createActiveUser();

      // Log & Oracle
      expect(() => user.completePayoutSetup("bank")).toThrow(
        expect.objectContaining({ code: "PAYOUT_ACCOUNT_NOT_READY" }),
      );
    });

    test("completePayoutSetup_WhenBankReferenceIsBlank_ThrowsInvalidInput", () => {
      // Input
      const user = createActiveUser();
      user.beginPayoutSetup({
        payoutAccountId: "account",
        providerAccountReference: "provider",
      });
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() => user.completePayoutSetup(" ")).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("completePayoutSetup_WhenCompletedWithDifferentBank_ThrowsInvalidState", () => {
      // Input
      const user = createActiveUser();
      user.beginPayoutSetup({
        payoutAccountId: "account",
        providerAccountReference: "provider",
      });
      user.completePayoutSetup("bank");
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() => user.completePayoutSetup("different-bank")).toThrow(
        expect.objectContaining({ code: "INVALID_STATE" }),
      );

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("failPayoutSetup_WhenNoSetupExists_ThrowsPayoutAccountNotReady", () => {
      // Input
      const user = createActiveUser();

      // Log & Oracle
      expect(() => user.failPayoutSetup()).toThrow(
        expect.objectContaining({ code: "PAYOUT_ACCOUNT_NOT_READY" }),
      );
    });

    test("failPayoutSetup_WhenSetupIsComplete_ThrowsInvalidState", () => {
      // Input
      const user = createActiveUser();
      user.beginPayoutSetup({
        payoutAccountId: "account",
        providerAccountReference: "provider",
      });
      user.completePayoutSetup("bank");
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() => user.failPayoutSetup()).toThrow(
        expect.objectContaining({ code: "INVALID_STATE" }),
      );

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("payoutDestination_WhenNoSetupExists_ThrowsPayoutAccountNotReady", () => {
      // Input
      const user = createActiveUser();

      // Log & Oracle
      expect(() => user.payoutDestination()).toThrow(
        expect.objectContaining({ code: "PAYOUT_ACCOUNT_NOT_READY" }),
      );
    });

    test("payoutDestination_WhenSetupIsComplete_ReturnsFrozenDestination", () => {
      // Input
      const user = createActiveUser();
      user.beginPayoutSetup({
        payoutAccountId: "account",
        providerAccountReference: "provider",
      });
      user.completePayoutSetup("bank");

      // Log
      const destination = user.payoutDestination();

      // Oracle
      expect(destination).toEqual({
        payoutAccountId: "account",
        userId: "owner",
        providerAccountReference: "provider",
        bankAccountReference: "bank",
      });
      expect(Object.isFrozen(destination)).toBe(true);
    });

    test("payoutDestination_WhenAccountIsInactive_ThrowsInactiveAccount", () => {
      // Input
      const user = createActiveUser();
      user.beginPayoutSetup({
        payoutAccountId: "account",
        providerAccountReference: "provider",
      });
      user.completePayoutSetup("bank");
      user.deactivate(deactivationWithoutObligations());

      // Log & Oracle
      expect(() => user.payoutDestination()).toThrow(
        expect.objectContaining({ code: "INACTIVE_ACCOUNT" }),
      );
    });
  });

  describe("Deactivation", () => {
    test("deactivate_WhenAvailableBalanceIsPositive_ThrowsActiveObligations", () => {
      // Input
      const user = createActiveUser();
      const input = {
        ...deactivationWithoutObligations(),
        availableBalance: Money.fromCents(1),
      };
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() => user.deactivate(input)).toThrow(
        expect.objectContaining({ code: "ACTIVE_OBLIGATIONS" }),
      );

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("deactivate_WhenHeldBalanceIsPositive_ThrowsActiveObligations", () => {
      // Input
      const user = createActiveUser();
      const input = {
        ...deactivationWithoutObligations(),
        heldBalance: Money.fromCents(1),
      };
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() => user.deactivate(input)).toThrow(
        expect.objectContaining({ code: "ACTIVE_OBLIGATIONS" }),
      );

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("deactivate_WhenActiveCommitmentsExist_ThrowsActiveObligations", () => {
      // Input
      const user = createActiveUser();
      const input = {
        ...deactivationWithoutObligations(),
        activeCommitments: 1,
      };
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() => user.deactivate(input)).toThrow(
        expect.objectContaining({ code: "ACTIVE_OBLIGATIONS" }),
      );

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("deactivate_WhenActiveCommitmentsAreNegative_ThrowsInvalidInput", () => {
      // Input
      const user = createActiveUser();
      const input = {
        ...deactivationWithoutObligations(),
        activeCommitments: -1,
      };
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() => user.deactivate(input)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("deactivate_WhenActiveCommitmentsAreFractional_ThrowsInvalidInput", () => {
      // Input
      const user = createActiveUser();
      const input = {
        ...deactivationWithoutObligations(),
        activeCommitments: 0.5,
      };
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() => user.deactivate(input)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("deactivate_WhenUnsettledOwnedSessionsExist_ThrowsActiveObligations", () => {
      // Input
      const user = createActiveUser();
      const input = {
        ...deactivationWithoutObligations(),
        unsettledOwnedSessions: 1,
      };
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() => user.deactivate(input)).toThrow(
        expect.objectContaining({ code: "ACTIVE_OBLIGATIONS" }),
      );

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("deactivate_WhenUnsettledOwnedSessionsAreNegative_ThrowsInvalidInput", () => {
      // Input
      const user = createActiveUser();
      const input = {
        ...deactivationWithoutObligations(),
        unsettledOwnedSessions: -1,
      };
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() => user.deactivate(input)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("deactivate_WhenUnsettledOwnedSessionsAreFractional_ThrowsInvalidInput", () => {
      // Input
      const user = createActiveUser();
      const input = {
        ...deactivationWithoutObligations(),
        unsettledOwnedSessions: 0.5,
      };
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() => user.deactivate(input)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("deactivate_WhenPendingPayoutsExist_ThrowsActiveObligations", () => {
      // Input
      const user = createActiveUser();
      const input = { ...deactivationWithoutObligations(), pendingPayouts: 1 };
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() => user.deactivate(input)).toThrow(
        expect.objectContaining({ code: "ACTIVE_OBLIGATIONS" }),
      );

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("deactivate_WhenPendingPayoutsAreNegative_ThrowsInvalidInput", () => {
      // Input
      const user = createActiveUser();
      const input = { ...deactivationWithoutObligations(), pendingPayouts: -1 };
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() => user.deactivate(input)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("deactivate_WhenPendingPayoutsAreFractional_ThrowsInvalidInput", () => {
      // Input
      const user = createActiveUser();
      const input = {
        ...deactivationWithoutObligations(),
        pendingPayouts: 0.5,
      };
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() => user.deactivate(input)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("deactivate_WhenActiveOwnedGroupsExist_ThrowsActiveObligations", () => {
      // Input
      const user = createActiveUser();
      const input = {
        ...deactivationWithoutObligations(),
        activeOwnedGroups: 1,
      };
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() => user.deactivate(input)).toThrow(
        expect.objectContaining({ code: "ACTIVE_OBLIGATIONS" }),
      );

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("deactivate_WhenActiveOwnedGroupsAreNegative_ThrowsInvalidInput", () => {
      // Input
      const user = createActiveUser();
      const input = {
        ...deactivationWithoutObligations(),
        activeOwnedGroups: -1,
      };
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() => user.deactivate(input)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("deactivate_WhenActiveOwnedGroupsAreFractional_ThrowsInvalidInput", () => {
      // Input
      const user = createActiveUser();
      const input = {
        ...deactivationWithoutObligations(),
        activeOwnedGroups: 0.5,
      };
      const before = accountStateOf(user);

      // Log & Oracle
      expect(() => user.deactivate(input)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );

      // Log
      const rejectedAccountState = accountStateOf(user);

      // Oracle
      expect(rejectedAccountState).toEqual(before);
    });

    test("deactivate_WhenNoObligationsRemain_AnonymisesProfile", () => {
      // Input
      const user = createActiveUser();
      user.updatePreferences({
        preferredSports: new Set(["Tennis"]),
        preferredRegions: new Set(["West"]),
      });

      // Log
      user.deactivate(deactivationWithoutObligations());
      const deactivatedProfile = {
        status: user.accountStatus,
        email: user.email,
        sports: [...user.preferredSports],
        regions: [...user.preferredRegions],
      };

      // Oracle
      expect(deactivatedProfile.status).toBe("INACTIVE");
      expect(deactivatedProfile.email).toBeNull();
      expect(deactivatedProfile.sports).toEqual([]);
      expect(deactivatedProfile.regions).toEqual([]);
    });

    test("deactivate_WhenPayoutSetupIsComplete_RetainsFinancialIdentity", () => {
      // Input
      const user = createActiveUser();
      user.beginPayoutSetup({
        payoutAccountId: "account",
        providerAccountReference: "provider",
      });
      user.completePayoutSetup("bank");
      const wallet = user.wallet;
      const payoutAccount = user.payoutAccount;

      // Log
      user.deactivate(deactivationWithoutObligations());
      const retainedIdentity = {
        userId: user.userId,
        wallet: user.wallet,
        payoutAccount: user.payoutAccount,
      };

      // Oracle
      expect(retainedIdentity.userId).toBe("owner");
      expect(retainedIdentity.wallet).toBe(wallet);
      expect(retainedIdentity.payoutAccount).toBe(payoutAccount);
      expect(retainedIdentity.payoutAccount?.bankAccountReference).toBe("bank");
    });

    test("deactivate_WhenAlreadyInactive_LeavesStateUnchanged", () => {
      // Input
      const user = createActiveUser();
      user.deactivate(deactivationWithoutObligations());
      const before = accountStateOf(user);

      // Log
      user.deactivate(deactivationWithoutObligations());
      const repeatedDeactivationState = accountStateOf(user);

      // Oracle
      expect(repeatedDeactivationState).toEqual(before);
    });
  });
});

function createActiveUser(): User {
  return User.create({
    userId: "owner",
    email: new Email("owner@example.com"),
    walletId: "w-owner",
    now: userLoadedAt,
  });
}

function deactivationWithoutObligations(): DeactivationInput {
  return {
    availableBalance: Money.fromCents(0),
    heldBalance: Money.fromCents(0),
    activeCommitments: 0,
    unsettledOwnedSessions: 0,
    pendingPayouts: 0,
    activeOwnedGroups: 0,
  };
}

function accountStateOf(user: User) {
  return {
    email: user.email?.toString() ?? null,
    emailVerified: user.emailVerified,
    accountStatus: user.accountStatus,
    preferredSports: [...user.preferredSports],
    preferredRegions: [...user.preferredRegions],
    payoutAccount: user.payoutAccount && {
      payoutAccountId: user.payoutAccount.payoutAccountId,
      setupStatus: user.payoutAccount.setupStatus,
      bankAccountReference: user.payoutAccount.bankAccountReference,
    },
  };
}
