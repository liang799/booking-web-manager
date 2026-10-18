import { describe, expect, test, vi } from "vitest";
import { Session, type User } from "@/domain";
import { GetSessionInvitation } from "@/use-cases/sessions/GetSessionInvitation";
import { GetInvitedSession, type InvitedSessionReader } from "@/use-cases/sessions/GetInvitedSession";
import type { SessionManagementRepositories, SessionManagementTransaction } from "@/use-cases/sessions/session-management-transaction";
import { createTestUser } from "../domain/accounts/user-fixtures";
import { createTestSession, hoursBeforeSessionStart, sessionDetails, sessionStartsAt, sessionState } from "../domain/sessions/session/session-fixtures";

describe("Session invitation owner read", () => {
  test.each(["PRIVATE", "PUBLIC"] as const)("returns the unchanged %s invitation without requiring payout setup or email confirmation", async (visibility) => {
    const session = new Session(sessionDetails({ visibility, roomToken: " Mixed +/?#% token " }));
    const scenario = invitation(session);
    scenario.getUser.mockResolvedValue(createTestUser({ userId: "booker", email: null, emailVerified: false }));
    const before = sessionState(session);

    expect(await scenario.invitation.forBooker("booker", "s")).toEqual({ sessionId: "s", roomToken: " Mixed +/?#% token " });
    expect(sessionState(session)).toEqual(before);
    expect(scenario.saveVisibility).not.toHaveBeenCalled();
  });

  test("allows sharing a full session without changing its roster or holds", async () => {
    const session = createTestSession({ committedUserIds: ["alice", "bob"] });
    const scenario = invitation(session);
    const before = sessionState(session);

    expect(await scenario.invitation.forBooker("booker", "s")).toEqual({ sessionId: "s", roomToken: "room" });
    expect(session.getAvailableSlots(hoursBeforeSessionStart(48))).toBe(0);
    expect(sessionState(session)).toEqual(before);
    expect(scenario.saveVisibility).not.toHaveBeenCalled();
  });

  test("requires current active-account access before reading any invitation", async () => {
    const scenario = invitation();
    scenario.getUser.mockResolvedValue(createTestUser({ userId: "booker", accountStatus: "INACTIVE" }));
    await expect(scenario.invitation.forBooker("booker", "s")).rejects.toMatchObject({ code: "INACTIVE_ACCOUNT" });
    expect(scenario.getSession).not.toHaveBeenCalled();
  });

  test("does not reveal another owner's invitation", async () => {
    const scenario = invitation();
    scenario.getUser.mockResolvedValue(createTestUser({ userId: "other" }));
    await expect(scenario.invitation.forBooker("other", "s")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(scenario.saveVisibility).not.toHaveBeenCalled();
  });

  test("captures time after loading the session so a request delayed past start cannot reveal a usable link", async () => {
    const scenario = invitation();
    scenario.getSession.mockImplementation(async () => {
      scenario.clock.now.mockReturnValue(sessionStartsAt);
      return scenario.session;
    });
    await expect(scenario.invitation.forBooker("booker", "s")).rejects.toMatchObject({ code: "SESSION_STARTED" });
  });

  test.each(["CANCELLED", "SETTLED"] as const)("rejects a %s session", async (status) => {
    const scenario = invitation(new Session(sessionDetails({ status })));
    await expect(scenario.invitation.forBooker("booker", "s")).rejects.toMatchObject({ code: "SESSION_CLOSED" });
  });

  test("distinguishes missing accounts and sessions without generating a replacement token", async () => {
    const scenario = invitation();
    scenario.getUser.mockResolvedValueOnce(null);
    await expect(scenario.invitation.forBooker("booker", "s")).rejects.toMatchObject({ code: "NOT_FOUND" });
    scenario.getSession.mockResolvedValueOnce(null);
    await expect(scenario.invitation.forBooker("booker", "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(scenario.saveVisibility).not.toHaveBeenCalled();
  });

  test("does not return the token if completing the transaction fails", async () => {
    const scenario = invitation();
    const failure = new Error("Commit failed");
    scenario.run.mockImplementation(async (work) => { await work(scenario.repositories); throw failure; });
    await expect(scenario.invitation.forBooker("booker", "s")).rejects.toBe(failure);
  });
});

describe("Token-bound session preview", () => {
  test("preserves the exact token and uses a fresh time boundary on each request", async () => {
    const findByToken = vi.fn<InvitedSessionReader["findByToken"]>().mockResolvedValue(null);
    const clock = { now: vi.fn().mockReturnValueOnce(hoursBeforeSessionStart(1)).mockReturnValueOnce(sessionStartsAt) };
    const preview = new GetInvitedSession({ reader: { findByToken }, clock });
    const token = " MiXeD +/?#% token ";

    expect(await preview.byToken("s", token)).toBeNull();
    expect(await preview.byToken("s", token)).toBeNull();
    expect(findByToken).toHaveBeenNthCalledWith(1, "s", token, hoursBeforeSessionStart(1));
    expect(findByToken).toHaveBeenNthCalledWith(2, "s", token, sessionStartsAt);
  });

  test("returns native date display facts without hydrating accounts or obscuring infrastructure failures", async () => {
    const session = createTestSession();
    const result = { sessionId: "s", venueName: session.booking.venueName, sport: session.booking.sport,
      region: session.booking.region, startAt: session.booking.startAt, endAt: session.booking.endAt,
      totalSlots: session.totalSlots, bookingShareCents: session.bookingShare.toCents() };
    const failure = new Error("Database unavailable");
    const findByToken = vi.fn<InvitedSessionReader["findByToken"]>().mockResolvedValueOnce(result).mockRejectedValueOnce(failure);
    const preview = new GetInvitedSession({ reader: { findByToken }, clock: { now: () => hoursBeforeSessionStart(1) } });

    expect(await preview.byToken("s", "room")).toEqual(result);
    await expect(preview.byToken("s", "room")).rejects.toBe(failure);
  });
});

function invitation(session = createTestSession()) {
  const getUser = vi.fn<(id: string) => Promise<User | null>>().mockResolvedValue(createTestUser({ userId: "booker" }));
  const getSession = vi.fn<(id: string) => Promise<Session | null>>().mockResolvedValue(session);
  const saveVisibility = vi.fn<SessionManagementRepositories["sessions"]["saveVisibility"]>();
  const repositories: SessionManagementRepositories = {
    users: { get: getUser },
    sessions: { get: getSession, listUpcoming: async () => [], listEndedOpen: async () => [], saveVisibility },
  };
  const transaction: SessionManagementTransaction = { run: (work) => work(repositories) };
  const run = vi.spyOn(transaction, "run");
  const clock = { now: vi.fn(() => hoursBeforeSessionStart(48)) };
  return { session, repositories, getUser, getSession, saveVisibility, run, clock, invitation: new GetSessionInvitation({ transaction, clock }) };
}
