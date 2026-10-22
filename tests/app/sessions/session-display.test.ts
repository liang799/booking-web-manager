import { describe, expect, test } from "vitest";
import type { SessionFeedItem } from "@/app/sessions/session-feed-contract";
import { sessionCalendarHref, sessionDate, sessionStatus, sessionTime, timelineGroup } from "@/app/sessions/_components/session-display";

const session: SessionFeedItem = {
  sessionId: "10000000-0000-4000-8000-000000000001",
  venueName: "Bukit Timah Community Club",
  sport: "Tennis",
  region: "Central",
  startAt: "2026-10-21T19:00:00+08:00",
  endAt: "2026-10-21T20:00:00+08:00",
  capacity: 4,
  participantCount: 2,
  bookingShareCents: 500,
  visibility: "PRIVATE",
  status: "OPEN",
  role: "PARTICIPANT",
  participationStatus: "COMMITTED",
  section: "upcoming",
  unverifiedCount: 0,
};

describe("personal session status", () => {
  test.each(["WITHDRAWN", "REMOVED", "LEFT_WAITLIST", "CANCELLED", "WAITLISTED"] as const)(
    "keeps host management status when the owner's own participation is %s",
    (participationStatus) => {
      const hosted = { ...session, role: "HOST" as const, participationStatus };
      expect(sessionStatus(hosted)).toBe("Hosting");
      expect(sessionStatus({ ...hosted, section: "past", unverifiedCount: 2 })).toBe("Check attendance");
      expect(sessionStatus({ ...hosted, section: "past", status: "SETTLED" })).toBe("Completed");
    },
  );

  test("session cancellation takes precedence for hosts and participants", () => {
    expect(sessionStatus({ ...session, status: "CANCELLED" })).toBe("Cancelled");
    expect(sessionStatus({ ...session, role: "HOST", status: "CANCELLED" })).toBe("Cancelled");
  });

  test.each([
    ["COMMITTED", "Joined", "Completed"],
    ["WAITLISTED", "Waitlisted", "Not admitted"],
    ["WITHDRAWN", "Withdrawn", "Withdrawn"],
    ["REMOVED", "Removed", "Removed"],
    ["LEFT_WAITLIST", "Left waitlist", "Left waitlist"],
    ["CANCELLED", "Cancelled", "Cancelled"],
  ] as const)("preserves %s participation status across upcoming and history", (participationStatus, upcoming, past) => {
    expect(sessionStatus({ ...session, participationStatus })).toBe(upcoming);
    expect(sessionStatus({ ...session, participationStatus, section: "past" })).toBe(past);
  });
});

describe("timeline grouping", () => {
  const asOf = "2026-10-21T08:00:00+08:00";

  test.each(["WITHDRAWN", "CANCELLED"] as const)("does not label a future %s session as earlier this month", (participationStatus) => {
    expect(timelineGroup({ ...session, section: "past", participationStatus }, asOf)).toBe("Cancelled & previous bookings");
  });

  test("uses Singapore month and year boundaries for completed sessions", () => {
    expect(timelineGroup({ ...session, section: "past", startAt: "2026-10-20T19:00:00+08:00" }, asOf)).toBe("Earlier this month");
    expect(timelineGroup({ ...session, section: "past", startAt: "2026-10-31T23:00:00+08:00" }, "2026-10-31T16:30:00Z"))
      .toBe("October 2026");
    expect(timelineGroup({ ...session, section: "past", startAt: "2026-12-31T23:00:00+08:00" }, "2027-01-01T00:30:00+08:00"))
      .toBe("December 2026");
  });

  test("starts a new week at Monday midnight in Singapore", () => {
    const mondayInSingapore = "2026-10-25T16:30:00Z";
    expect(timelineGroup({ ...session, startAt: "2026-11-01T15:59:00Z" }, mondayInSingapore)).toBe("This week");
    expect(timelineGroup({ ...session, startAt: "2026-11-01T16:00:00Z" }, mondayInSingapore)).toBe("Coming up");
  });
});

describe("Singapore dates and calendar links", () => {
  test("renders a UTC instant on its Singapore calendar date", () => {
    expect(sessionDate("2026-10-20T17:15:00Z")).toEqual({
      weekday: "Wed", day: "21", month: "Oct", full: "21 Oct 2026",
    });
    expect(sessionTime(session)).toBe("7:00 PM – 8:00 PM");
  });

  test("includes the end date for an overnight booking", () => {
    expect(sessionTime({ startAt: "2026-10-21T15:30:00Z", endAt: "2026-10-21T17:00:00Z" }))
      .toBe("11:30 PM – 22 Oct 2026, 1:00 AM");
  });

  test("calendar timestamps preserve the booked instants and encode venue punctuation safely", () => {
    const url = new URL(sessionCalendarHref({
      ...session,
      venueName: "Court A & B, #02-01",
      startAt: "2026-10-21T23:30:00+08:00",
      endAt: "2026-10-22T01:00:00+08:00",
    }));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      action: "TEMPLATE",
      text: "Tennis Court Booking",
      location: "Court A & B, #02-01",
      dates: "20261021T153000Z/20261021T170000Z",
      ctz: "Asia/Singapore",
    });
  });
});
