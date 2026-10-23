import { describe, expect, test } from "vitest";
import { Money, Session } from "@/domain";
import {
  createTestSession,
  pendingPayoutDetails,
  createTestUser,
  hoursBeforeSessionStart,
  readyBooker,
  sessionEndsAt,
} from "./session-fixtures";

describe("Session", () => {
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
        .requireParticipation("p-alice").hold?.amount.toCents(),
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
      idempotencyKey: "key",
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
