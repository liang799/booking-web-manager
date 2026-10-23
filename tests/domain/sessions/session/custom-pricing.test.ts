import { describe, expect, test } from "vitest";
import { Money } from "@/domain";
import {
  creationDetails,
  createTestUser,
  hoursBeforeSessionStart,
  readyBooker,
  sessionEndsAt,
} from "./session-fixtures";

describe("Session", () => {
  test("join_WhenPriceExceedsEqualSplit_LocksChosenPrice", () => {
    // Input
    const booker = readyBooker();
    const session = booker.createSession({
      ...creationDetails(),
      bookingShare: Money.fromCents(750),
    });
    const alice = createTestUser({
      userId: "alice",
      availableFundsCents: 750,
    }).asParticipant();

    // Log
    const admission = alice.join(session, {
      participationId: "p-alice",
      holdId: "h-alice",
      now: hoursBeforeSessionStart(48),
    });
    const aliceHold =
      session.participantList.requireParticipation("p-alice").hold;
    const bookingShare = session.bookingShare;

    // Oracle
    expect(
      admission.instructions.map(({ kind, amount }) => [
        kind,
        amount.toCents(),
      ]),
    ).toEqual([["LOCK", 750]]);
    expect(aliceHold?.amount.toCents()).toBe(750);
    expect(bookingShare.toCents()).toBe(750);
  });

  test("withdraw_WhenCustomPriceIsRefundable_RefundsChosenPrice", () => {
    // Input
    const booker = readyBooker();
    const session = booker.createSession({
      ...creationDetails(),
      bookingShare: Money.fromCents(750),
    });
    const alice = createTestUser({
      userId: "alice",
      availableFundsCents: 750,
    }).asParticipant();
    alice.join(session, {
      participationId: "p-alice",
      holdId: "h-alice",
      now: hoursBeforeSessionStart(48),
    });

    // Log
    const withdrawal = alice.withdraw(session, {
      participationId: "p-alice",
      now: hoursBeforeSessionStart(31),
    });
    const aliceHold =
      session.participantList.requireParticipation("p-alice").hold;

    // Oracle
    expect(
      withdrawal.instructions.map(({ kind, amount }) => [
        kind,
        amount.toCents(),
      ]),
    ).toEqual([["REFUND", 750]]);
    expect(aliceHold?.state).toBe("REFUNDED");
  });

  test("cancel_WhenCustomPriceWasCollected_RefundsTheFullHold", () => {
    // Input
    const booker = readyBooker();
    const session = booker.createSession({
      ...creationDetails(),
      bookingShare: Money.fromCents(750),
    });
    const alice = createTestUser({
      userId: "alice",
      availableFundsCents: 750,
    }).asParticipant();
    alice.join(session, {
      participationId: "p-alice",
      holdId: "h-alice",
      now: hoursBeforeSessionStart(48),
    });

    // Log
    const cancellation = booker.cancel(session, hoursBeforeSessionStart(30));
    const bookingShare = session.bookingShare;

    // Oracle
    expect(
      cancellation.instructions.map(({ kind, amount }) => [
        kind,
        amount.toCents(),
      ]),
    ).toEqual([["REFUND", 750]]);
    expect(bookingShare.toCents()).toBe(750);
  });

  test("preparePayout_WhenCustomPriceAttendanceIsVerified_IncludesChosenAmount", () => {
    // Input
    const booker = readyBooker();
    const session = booker.createSession({
      ...creationDetails(),
      bookingShare: Money.fromCents(750),
    });
    const alice = createTestUser({
      userId: "alice",
      availableFundsCents: 750,
    }).asParticipant();
    alice.join(session, {
      participationId: "p-alice",
      holdId: "h-alice",
      now: hoursBeforeSessionStart(48),
    });
    booker.verifyAttendance(session, {
      now: sessionEndsAt,
      marks: [{ participationId: "p-alice", attendance: "ATTENDED" }],
    });

    // Log
    const payout = booker.preparePayout(session, {
      payoutId: "out",
      idempotencyKey: "key",
      now: sessionEndsAt,
    });
    const sessionStatus = session.status;
    const aliceHold =
      session.participantList.requireParticipation("p-alice").hold;

    // Oracle
    expect(
      payout?.lines.map(({ kind, amount }) => [kind, amount.toCents()]),
    ).toEqual([["RELEASE", 750]]);
    expect(sessionStatus).toBe("PAYOUT_PENDING");
    expect(aliceHold?.state).toBe("HELD");
  });

  test("completeSettlement_WhenCustomPricePayoutSucceeds_ReleasesChosenAmount", () => {
    // Input
    const booker = readyBooker();
    const session = booker.createSession({
      ...creationDetails(),
      bookingShare: Money.fromCents(750),
    });
    const alice = createTestUser({
      userId: "alice",
      availableFundsCents: 750,
    }).asParticipant();
    alice.join(session, {
      participationId: "p-alice",
      holdId: "h-alice",
      now: hoursBeforeSessionStart(48),
    });
    booker.verifyAttendance(session, {
      now: sessionEndsAt,
      marks: [{ participationId: "p-alice", attendance: "ATTENDED" }],
    });
    booker.preparePayout(session, {
      payoutId: "out",
      idempotencyKey: "key",
      now: sessionEndsAt,
    });

    // Log
    const completion = session.completeSettlement("out", sessionEndsAt);
    const aliceHold =
      session.participantList.requireParticipation("p-alice").hold;

    // Oracle
    expect(
      completion.instructions.map(({ kind, amount }) => [
        kind,
        amount.toCents(),
      ]),
    ).toEqual([["RELEASE", 750]]);
    expect(aliceHold?.state).toBe("RELEASED");
  });
});
