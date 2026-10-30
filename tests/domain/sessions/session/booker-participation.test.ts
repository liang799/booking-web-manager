import { describe, expect, test } from "vitest";
import { Money, Session } from "@/domain";
import {
  committedParticipation, creationDetails, createTestUser, hoursBeforeSessionStart, readyBooker, sessionDetails,
} from "./session-fixtures";

describe("Booker participation", () => {
  test("createSession_WhenNoGuestsHaveJoined_ReservesTheBookersPlace", () => {
    const session = readyBooker().createSession(creationDetails(3));

    expect(session.getAvailableSlots()).toBe(2);
    expect(session.participantList.participations).toEqual([]);
    expect(session.bookingShare.toCents()).toBe(333);
  });

  test("createSession_WhenOnlyTheBookerIsPlaying_AllowsOnePlace", () => {
    const session = readyBooker().createSession(creationDetails(1));

    expect(session.getAvailableSlots()).toBe(0);
    expect(session.bookingShare.toCents()).toBe(1000);
  });

  test("join_WhenTheBookersPlaceFillsCapacity_WaitlistsTheNextPlayer", () => {
    const session = readyBooker().createSession(creationDetails(2));
    const now = hoursBeforeSessionStart(48);
    const alice = createTestUser({ userId: "alice", availableFundsCents: 1000 }).asParticipant();
    const ben = createTestUser({ userId: "ben", availableFundsCents: 1000 }).asParticipant();

    const admitted = alice.join(session, { participationId: "p-alice", holdId: "h-alice", now });
    const queued = ben.join(session, { participationId: "p-ben", holdId: "h-ben", now });

    expect(admitted.kind).toBe("COMMITTED");
    expect(queued.kind).toBe("WAITLISTED");
    expect(queued.instructions).toEqual([]);
    expect(session.getAvailableSlots()).toBe(0);
  });

  test("join_WhenTheBookerTriesToEnrollAgain_RejectsWithoutHoldingFunds", () => {
    const session = readyBooker().createSession(creationDetails(3));
    const booker = createTestUser({ userId: "booker", availableFundsCents: 1000 }).asParticipant();

    expect(() => booker.join(session, {
      participationId: "p-booker", holdId: "h-booker", now: hoursBeforeSessionStart(48),
    })).toThrow(expect.objectContaining({ code: "ALREADY_PARTICIPATING" }));
    expect(session.participantList.participations).toEqual([]);
    expect(session.getAvailableSlots()).toBe(2);
  });

  test("constructor_WhenLegacyCapacityGainsTheBookersPlace_PreservesTheAcceptedPrice", () => {
    const session = new Session(sessionDetails({
      totalSlots: 31, bookingShare: Money.fromCents(1000),
    }));

    expect(session.getAvailableSlots()).toBe(30);
    expect(session.bookingShare.toCents()).toBe(1000);
  });

  test("constructor_WhenLegacyBookerAlreadyHasAFundedPlace_CountsThemOnce", () => {
    const details = sessionDetails({ totalSlots: 2 });
    const session = new Session({ ...details, participations: [
      committedParticipation({ holdingAccountId: "platform", bookingShare: Money.fromCents(500) }, "booker"),
      committedParticipation({ holdingAccountId: "platform", bookingShare: Money.fromCents(500) }, "alice"),
    ] });

    expect(session.getAvailableSlots()).toBe(0);
    expect(session.participantList.committedCount).toBe(2);
  });

  test("withdraw_WhenBookerHasALegacyFundedPlace_RequiresSessionCancellation", () => {
    const session = legacyBookerSession();
    const booker = createTestUser({ userId: "booker" }).asParticipant();

    expect(() => booker.withdraw(session, { participationId: "p-booker", now: hoursBeforeSessionStart(48), replacementMode: "OPEN_SLOT" }))
      .toThrow(expect.objectContaining({ code: "INVALID_STATE" }));
    expect(session.participantList.requireParticipation("p-booker").status).toBe("COMMITTED");
  });

  test("removeParticipant_WhenBookerHasALegacyFundedPlace_RequiresSessionCancellation", () => {
    const session = legacyBookerSession();

    expect(() => readyBooker().removeParticipant(session, "p-booker", hoursBeforeSessionStart(48)))
      .toThrow(expect.objectContaining({ code: "INVALID_STATE" }));
    expect(session.participantList.requireParticipation("p-booker").status).toBe("COMMITTED");
  });

  test("withdraw_WhenReplacementInviteeIsTheBooker_RejectsWithoutReservingAnotherPlace", () => {
    const session = new Session({ ...sessionDetails(), participations: [
      committedParticipation({ holdingAccountId: "platform", bookingShare: Money.fromCents(500) }, "alice"),
    ] });

    expect(() => createTestUser({ userId: "alice" }).asParticipant().withdraw(session, {
      participationId: "p-alice", now: hoursBeforeSessionStart(10),
      replacementMode: "DIRECT_INVITE", replacementInviteeId: "booker",
    })).toThrow(expect.objectContaining({ code: "INVALID_STATE" }));
    expect(session.participantList.requireParticipation("p-alice").status).toBe("COMMITTED");
    expect(session.participantList.reservedCount).toBe(0);
  });
});

function legacyBookerSession(): Session {
  return new Session({ ...sessionDetails(), participations: [
    committedParticipation({ holdingAccountId: "platform", bookingShare: Money.fromCents(500) }, "booker"),
  ] });
}
