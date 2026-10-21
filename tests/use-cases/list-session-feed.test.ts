import { describe, expect, test, vi } from "vitest";
import { ListSessionFeed, type PersonalSession, type SessionFeedReader } from "@/use-cases/sessions/ListSessionFeed";

const userId = "10000000-0000-4000-8000-000000000001";
const now = new Date("2040-01-01T00:00:00Z");
const session = (index: number): PersonalSession => ({
  sessionId: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  venueName: "Bukit Timah CC", sport: "Tennis", region: "West",
  startAt: new Date("2040-01-02T00:00:00Z"), endAt: new Date("2040-01-02T01:00:00Z"),
  capacity: 4, participantCount: 2, bookingShareCents: 500, visibility: "PRIVATE",
  status: "OPEN", role: "PARTICIPANT", participationStatus: "COMMITTED", section: "upcoming", unverifiedCount: 0,
});

describe("UC2-03 Personal sessions feed", () => {
  test("bounds a page and advances from the last returned row, preserving the time boundary", async () => {
    const read = vi.fn<SessionFeedReader["read"]>().mockResolvedValue({
      accountStatus: "ACTIVE", sessions: Array.from({ length: 13 }, (_, i) => session(i + 1)), upcomingCount: 20, pastCount: 9,
    });
    const feed = new ListSessionFeed({ reader: { read }, clock: { now: () => now } });
    const first = await feed.list(userId, { tab: "joined" });
    expect(first.sessions).toHaveLength(12);
    expect(first.next).toEqual({ section: "upcoming", startAt: session(12).startAt, sessionId: session(12).sessionId });
    expect(read).toHaveBeenCalledExactlyOnceWith({ userId, tab: "joined", asOf: now, after: undefined, limit: 13 });
    expect(first).toMatchObject({ asOf: now, upcomingCount: 20, pastCount: 9 });
    if (!first.next) throw new Error("Expected a next page");
    await feed.list(userId, { tab: "joined", asOf: first.asOf, after: first.next });
    expect(read).toHaveBeenLastCalledWith({ userId, tab: "joined", asOf: now, after: first.next, limit: 13 });
  });

  test.each([0, 12])("ends pagination when exactly %s records remain", async (length) => {
    const feed = new ListSessionFeed({
      reader: { read: async () => ({ accountStatus: "ACTIVE", sessions: Array.from({ length }, (_, i) => session(i)), upcomingCount: length, pastCount: 0 }) },
      clock: { now: () => now },
    });
    expect((await feed.list(userId, { tab: "hosting" })).next).toBeNull();
  });

  test.each([["INACTIVE", "INACTIVE_ACCOUNT"], [null, "NOT_FOUND"]] as const)("denies a %s account", async (accountStatus, code) => {
    const feed = new ListSessionFeed({
      reader: { read: async () => ({ accountStatus, sessions: [], upcomingCount: 0, pastCount: 0 }) },
      clock: { now: () => now },
    });
    await expect(feed.list(userId, { tab: "joined" })).rejects.toMatchObject({ code });
  });
});
