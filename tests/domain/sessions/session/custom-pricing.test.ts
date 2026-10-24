import { describe, expect, test } from "vitest";
import { Booking, Money, Session } from "@/domain";
import {
  createTestSession,
  pendingPayoutDetails,
  createTestUser,
  hoursBeforeSessionStart,
  readyBooker,
  sessionEndsAt,
  sessionStartsAt,
  sessionDetails,
} from "./session-fixtures";

describe("Session participant pricing", () => {
  describe("Participant price selection", () => {
    test("constructor_WhenPriceIsOmitted_PreservesEqualSplit", () => {
      const details = sessionDetails({
        booking: bookingWithCost(Money.fromCents(1001)),
        totalSlots: 3,
      });

      const session = new Session(details);

      expect(session.bookingShare.toCents()).toBe(333);
    });

    test("constructor_WhenPriceEqualsMinimum_AcceptsBoundedAdjustment", () => {
      const details = sessionDetails({
        booking: bookingWithCost(Money.fromCents(1001)),
        totalSlots: 3,
        bookingShare: Money.fromCents(167),
      });

      const session = new Session(details);

      expect(session.bookingShare.toCents()).toBe(167);
    });

    test("constructor_WhenPriceExceedsEqualSplitByOneCent_AcceptsBoundedAdjustment", () => {
      const details = sessionDetails({
        booking: bookingWithCost(Money.fromCents(1001)),
        totalSlots: 3,
        bookingShare: Money.fromCents(334),
      });

      const session = new Session(details);

      expect(session.bookingShare.toCents()).toBe(334);
    });

    test("constructor_WhenPriceEqualsMaximum_AcceptsBoundedAdjustment", () => {
      const details = sessionDetails({
        booking: bookingWithCost(Money.fromCents(1001)),
        totalSlots: 3,
        bookingShare: Money.fromCents(666),
      });

      const session = new Session(details);

      expect(session.bookingShare.toCents()).toBe(666);
    });

    test("constructor_WhenPriceIsZero_RejectsOutsideBounds", () => {
      const details = sessionDetails({
        booking: bookingWithCost(Money.fromCents(1001)),
        totalSlots: 3,
        bookingShare: Money.fromCents(0),
      });

      expect(() => new Session(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenPriceIsOneCentBelowMinimum_RejectsOutsideBounds", () => {
      const details = sessionDetails({
        booking: bookingWithCost(Money.fromCents(1001)),
        totalSlots: 3,
        bookingShare: Money.fromCents(166),
      });

      expect(() => new Session(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenPriceIsOneCentAboveMaximum_RejectsOutsideBounds", () => {
      const details = sessionDetails({
        booking: bookingWithCost(Money.fromCents(1001)),
        totalSlots: 3,
        bookingShare: Money.fromCents(667),
      });

      expect(() => new Session(details)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });
  });

  describe("Chosen price across financial operations", () => {
    test("join_WhenPriceExceedsEqualSplit_LocksChosenPrice", () => {
      const session = createTestSession({ bookingShare: Money.fromCents(750) });
      const alice = createTestUser({
        userId: "alice",
        availableFundsCents: 750,
      }).asParticipant();

      const admission = alice.join(session, {
        participationId: "p-alice",
        holdId: "h-alice",
        now: hoursBeforeSessionStart(48),
      });

      expect(
        admission.instructions.map(({ kind, amount }) => [
          kind,
          amount.toCents(),
        ]),
      ).toEqual([["LOCK", 750]]);
      expect(
        session.participantList
          .requireParticipation("p-alice")
          .hold?.amount.toCents(),
      ).toBe(750);
      expect(session.bookingShare.toCents()).toBe(750);
    });

    test("withdraw_WhenCustomPriceIsRefundable_RefundsChosenPrice", () => {
      const session = createTestSession({
        bookingShare: Money.fromCents(750),
        committedUserIds: ["alice"],
      });
      const alice = createTestUser({
        userId: "alice",
        availableFundsCents: 750,
      }).asParticipant();

      const withdrawal = alice.withdraw(session, {
        participationId: "p-alice",
        now: hoursBeforeSessionStart(31),
      });

      expect(
        withdrawal.instructions.map(({ kind, amount }) => [
          kind,
          amount.toCents(),
        ]),
      ).toEqual([["REFUND", 750]]);
      expect(
        session.participantList.requireParticipation("p-alice").hold?.state,
      ).toBe("REFUNDED");
    });

    test("cancel_WhenCustomPriceWasCollected_RefundsTheFullHold", () => {
      const booker = readyBooker();
      const session = createTestSession({
        bookingShare: Money.fromCents(750),
        committedUserIds: ["alice"],
      });

      const cancellation = booker.cancel(session, hoursBeforeSessionStart(30));

      expect(
        cancellation.instructions.map(({ kind, amount }) => [
          kind,
          amount.toCents(),
        ]),
      ).toEqual([["REFUND", 750]]);
      expect(session.bookingShare.toCents()).toBe(750);
    });

    test("preparePayout_WhenCustomPriceAttendanceIsVerified_IncludesChosenAmount", () => {
      const booker = readyBooker();
      const session = createTestSession({
        bookingShare: Money.fromCents(750),
        committedUserIds: ["alice"],
        attendanceByUserId: { alice: "ATTENDED" },
        status: "AWAITING_PAYOUT",
      });

      const payout = booker.preparePayout(session, {
        payoutId: "out",
        now: sessionEndsAt,
      });

      expect(
        payout?.lines.map(({ kind, amount }) => [kind, amount.toCents()]),
      ).toEqual([["RELEASE", 750]]);
      expect(session.status).toBe("PAYOUT_PENDING");
      expect(
        session.participantList.requireParticipation("p-alice").hold?.state,
      ).toBe("HELD");
    });

    test("completeSettlement_WhenCustomPricePayoutSucceeds_ReleasesChosenAmount", () => {
      const session = new Session(
        pendingPayoutDetails(["alice"], { bookingShare: Money.fromCents(750) }),
      );

      const completion = session.completeSettlement("out", sessionEndsAt);

      expect(
        completion.instructions.map(({ kind, amount }) => [
          kind,
          amount.toCents(),
        ]),
      ).toEqual([["RELEASE", 750]]);
      expect(
        session.participantList.requireParticipation("p-alice").hold?.state,
      ).toBe("RELEASED");
    });
  });
});

function bookingWithCost(totalCost: Money): Booking {
  return new Booking({
    venueName: "Court",
    region: "North",
    sport: "Badminton",
    startAt: sessionStartsAt,
    endAt: sessionEndsAt,
    totalCost,
  });
}
