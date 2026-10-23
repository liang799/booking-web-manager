import { Money, PayoutAccount } from "@/domain";
import { describe, expect, test } from "vitest";
import {
  createTestUser,
  creationDetails,
  sessionEndsAt,
  readyBooker,
} from "../../sessions/session/session-fixtures";
import { readyBookerUser } from "../user-fixtures";

describe("Booker", () => {
  test("createSession_WhenEmailIsUnverified_AllowsCreation", () => {
    // Input
    const booker = createTestUser({
      userId: "booker",
      emailVerified: false,
      payoutAccount: readyBookerUser().payoutAccount,
    }).asBooker();

    // Log
    const bookingSession = booker.createSession(creationDetails());

    // Oracle
    expect(bookingSession.bookerId).toBe("booker");
  });

  test("createSession_WhenEmailIsMissing_RejectsWithEmailRequired", () => {
    // Input
    const booker = createTestUser({
      userId: "booker",
      email: null,
      emailVerified: false,
      payoutAccount: readyBookerUser().payoutAccount,
    }).asBooker();

    // Log & Oracle
    expect(() => booker.createSession(creationDetails())).toThrow(
      expect.objectContaining({ code: "EMAIL_REQUIRED" }),
    );
  });

  test("assertCanCreateSession_WhenEmailIsUnverified_AllowsCreation", () => {
    // Input
    const booker = createTestUser({
      userId: "booker",
      emailVerified: false,
      payoutAccount: readyBookerUser().payoutAccount,
    }).asBooker();

    // Log & Oracle
    expect(() => booker.assertCanCreateSession()).not.toThrow();
  });

  test("createSession_WhenRoleWasCreatedBeforeDeactivation_ThrowsInactiveAccount", () => {
    // Input
    const bookerUser = createTestUser({
      userId: "booker",
      availableFundsCents: 0,
      payoutAccount: readyBookerUser().payoutAccount,
    });
    const booker = bookerUser.asBooker();
    bookerUser.deactivate({
      availableBalance: Money.fromCents(0),
      heldBalance: Money.fromCents(0),
      activeCommitments: 0,
      unsettledOwnedSessions: 0,
      pendingPayouts: 0,
      activeOwnedGroups: 0,
    });

    // Log & Oracle
    expect(() => booker.createSession(creationDetails())).toThrow(
      expect.objectContaining({ code: "INACTIVE_ACCOUNT" }),
    );
  });

  test("createSession_WhenOptionalSettingsAreOmitted_UsesPrivateVisibilityAndEmptyLifecycle", () => {
    // Input
    const booker = readyBooker();
    const details = creationDetails();

    // Log
    const bookingSession = booker.createSession({
      ...details,
      visibility: undefined,
    });

    // Oracle
    expect(bookingSession.bookerId).toBe(booker.userId);
    expect(bookingSession.visibility).toBe("PRIVATE");
    expect(bookingSession.status).toBe("OPEN");
    expect(bookingSession.participantList.participations).toEqual([]);
    expect(bookingSession.participantList.nextQueueSequence).toBe(1);
    expect(bookingSession.payoutAttemptIds).toEqual([]);
    expect(bookingSession.payoutIdempotencyKeys).toEqual([]);
    expect(bookingSession.pendingSettlement).toBeUndefined();
  });

  test("createSession_WhenBookerIsInactive_ThrowsInactiveAccount", () => {
    // Input
    const booker = createTestUser({
      userId: "booker",
      accountStatus: "INACTIVE",
    }).asBooker();
    const details = creationDetails();

    // Log & Oracle
    expect(() => booker.createSession(details)).toThrow(
      expect.objectContaining({ code: "INACTIVE_ACCOUNT" }),
    );
  });

  test("createSession_WhenPayoutAccountIsIncomplete_ThrowsPayoutAccountNotReady", () => {
    // Input
    const booker = createTestUser({
      userId: "booker",
      payoutAccount: PayoutAccount.create({
        payoutAccountId: "pa",
        userId: "booker",
        providerAccountReference: "provider",
      }),
    }).asBooker();
    const details = creationDetails();

    // Log & Oracle
    expect(() => booker.createSession(details)).toThrow(
      expect.objectContaining({ code: "PAYOUT_ACCOUNT_NOT_READY" }),
    );
  });

  test("createSession_WhenShareWouldBeZero_ThrowsInvalidInput", () => {
    // Input
    const details = creationDetails();

    // Log & Oracle
    expect(() =>
      readyBooker().createSession({ ...details, totalSlots: 1001 }),
    ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  });

  test("createSession_WhenCapacityIsOne_ThrowsInvalidInput", () => {
    // Input
    const details = creationDetails();

    // Log & Oracle
    expect(() =>
      readyBooker().createSession({ ...details, totalSlots: 1 }),
    ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  });

  test("createSession_WhenMinimumHeadcountIsOne_ThrowsInvalidInput", () => {
    // Input
    const details = creationDetails();

    // Log & Oracle
    expect(() =>
      readyBooker().createSession({ ...details, minimumHeadcount: 1 }),
    ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  });

  test("createSession_WhenMinimumHeadcountExceedsCapacity_ThrowsInvalidInput", () => {
    // Input
    const details = creationDetails(3);

    // Log & Oracle
    expect(() =>
      readyBooker().createSession({ ...details, minimumHeadcount: 4 }),
    ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  });

  test("createSession_WhenMinimumHeadcountEqualsCapacity_PreservesMinimumHeadcount", () => {
    // Input
    const details = creationDetails(3);

    // Log
    const session = readyBooker().createSession({
      ...details,
      minimumHeadcount: 3,
    });

    // Oracle
    expect(session.minimumHeadcount).toBe(3);
  });

  test("createSession_WhenBookingHasEnded_ThrowsSessionStarted", () => {
    // Input
    const details = { ...creationDetails(), now: sessionEndsAt };

    // Log & Oracle
    expect(() => readyBooker().createSession(details)).toThrow(
      expect.objectContaining({ code: "SESSION_STARTED" }),
    );
  });
});
