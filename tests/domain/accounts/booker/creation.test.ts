import {
  Money,
  PayoutAccount,
  ReliabilityScore,
  type BookerSessionCreation,
} from "@/domain";
import { describe, expect, test } from "vitest";
import {
  createTestUser,
  creationDetails,
  sessionEndsAt,
  readyBooker,
} from "../../sessions/session/session-fixtures";
import { readyBookerUser } from "../user-fixtures";

describe("Booker session creation", () => {
  describe("Account eligibility", () => {
    test("createSession_WhenEmailIsUnverified_AllowsCreation", () => {
      const booker = createTestUser({
        userId: "booker",
        emailVerified: false,
        payoutAccount: readyBookerUser().payoutAccount,
      }).asBooker();

      const bookingSession = booker.createSession(creationDetails());

      expect(bookingSession.bookerId).toBe("booker");
    });

    test("assertCanCreateSession_WhenEmailIsUnverified_AllowsCreation", () => {
      const booker = createTestUser({
        userId: "booker",
        emailVerified: false,
        payoutAccount: readyBookerUser().payoutAccount,
      }).asBooker();

      expect(() => booker.assertCanCreateSession()).not.toThrow();
    });

    test("createSession_WhenEmailIsMissing_RejectsWithEmailRequired", () => {
      const booker = createTestUser({
        userId: "booker",
        email: null,
        emailVerified: false,
        payoutAccount: readyBookerUser().payoutAccount,
      }).asBooker();

      expect(() => booker.createSession(creationDetails())).toThrow(
        expect.objectContaining({ code: "EMAIL_REQUIRED" }),
      );
    });

    test("createSession_WhenRoleWasCreatedBeforeDeactivation_ThrowsInactiveAccount", () => {
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

      expect(() => booker.createSession(creationDetails())).toThrow(
        expect.objectContaining({ code: "INACTIVE_ACCOUNT" }),
      );
    });

    test("createSession_WhenBookerIsInactive_ThrowsInactiveAccount", () => {
      const booker = createTestUser({
        userId: "booker",
        accountStatus: "INACTIVE",
      }).asBooker();
      const details = creationDetails();

      expect(() => booker.createSession(details)).toThrow(
        expect.objectContaining({ code: "INACTIVE_ACCOUNT" }),
      );
    });

    test("createSession_WhenPayoutAccountIsIncomplete_ThrowsPayoutAccountNotReady", () => {
      const booker = createTestUser({
        userId: "booker",
        payoutAccount: PayoutAccount.create({
          payoutAccountId: "pa",
          userId: "booker",
          providerAccountReference: "provider",
        }),
      }).asBooker();
      const details = creationDetails();

      expect(() => booker.createSession(details)).toThrow(
        expect.objectContaining({ code: "PAYOUT_ACCOUNT_NOT_READY" }),
      );
    });
  });

  describe("Session settings", () => {
    test("createSession_WhenOptionalSettingsAreOmitted_UsesPrivateVisibilityAndEmptyLifecycle", () => {
      const booker = readyBooker();
      const details = creationDetails();

      const bookingSession = booker.createSession({
        ...details,
        visibility: undefined,
      });

      expect(bookingSession.bookerId).toBe(booker.userId);
      expect(bookingSession.visibility).toBe("PRIVATE");
      expect(bookingSession.status).toBe("OPEN");
      expect(bookingSession.participantList.participations).toEqual([]);
      expect(bookingSession.participantList.nextQueueSequence).toBe(1);
      expect(bookingSession.payoutAttemptIds).toEqual([]);
      expect(bookingSession.pendingSettlement).toBeUndefined();
    });

    test("createSession_WhenCustomSettingsAreProvided_PreservesThem", () => {
      const details: BookerSessionCreation = {
        ...creationDetails(),
        visibility: "PUBLIC",
        invitedGroupId: "group",
        minimumReliability: ReliabilityScore.from(80),
        bookingShare: Money.fromCents(750),
      };
      const booker = readyBooker();

      const session = booker.createSession(details);

      expect(session.visibility).toBe("PUBLIC");
      expect(session.invitedGroupId).toBe("group");
      expect(session.minimumReliability?.toNumber()).toBe(80);
      expect(session.bookingShare.toCents()).toBe(750);
    });
  });

  describe("Booking and capacity rules", () => {
    test("createSession_WhenShareWouldBeZero_ThrowsInvalidInput", () => {
      const details = creationDetails();

      expect(() =>
        readyBooker().createSession({ ...details, totalSlots: 1001001 }),
      ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("createSession_WhenCapacityIsZero_ThrowsInvalidInput", () => {
      const details = creationDetails();

      expect(() =>
        readyBooker().createSession({ ...details, totalSlots: 0 }),
      ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    test("createSession_WhenBookingHasEnded_ThrowsSessionStarted", () => {
      const details = { ...creationDetails(), now: sessionEndsAt };

      expect(() => readyBooker().createSession(details)).toThrow(
        expect.objectContaining({ code: "SESSION_STARTED" }),
      );
    });
  });
});
