import type { SessionAccountAction } from "../session-actions";
import type { SessionFeedItem } from "../session-feed-contract";

/** Fixed Singapore dates keep the weekly grouping and screenshots deterministic. */
export const sessionsAsOf = "2026-10-21T08:00:00+08:00";

export const sessionAccountActions: readonly SessionAccountAction[] = [
  { name: "create-session", href: "/sessions/create", method: "GET", inputs: {} },
];

type SessionExample = Pick<SessionFeedItem, "venueName" | "region" | "startAt" | "endAt" | "participantCount" | "section">;

const examples: readonly SessionExample[] = [
  { venueName: "Bukit Timah Community Club", region: "Central", startAt: "2026-10-21T19:00:00+08:00", endAt: "2026-10-21T20:00:00+08:00", participantCount: 2, section: "upcoming" },
  { venueName: "Bishan Tennis Centre", region: "Central", startAt: "2026-10-23T07:00:00+08:00", endAt: "2026-10-23T08:00:00+08:00", participantCount: 3, section: "upcoming" },
  { venueName: "Choa Chu Kang Tennis Centre", region: "West", startAt: "2026-10-24T08:00:00+08:00", endAt: "2026-10-24T09:00:00+08:00", participantCount: 4, section: "upcoming" },
  { venueName: "Heartbeat@Bedok", region: "East", startAt: "2026-10-25T10:00:00+08:00", endAt: "2026-10-25T11:00:00+08:00", participantCount: 1, section: "upcoming" },
  { venueName: "Bukit Timah Community Club", region: "Central", startAt: "2026-10-20T19:00:00+08:00", endAt: "2026-10-20T20:00:00+08:00", participantCount: 4, section: "past" },
  { venueName: "Bishan Tennis Centre", region: "Central", startAt: "2026-10-17T18:00:00+08:00", endAt: "2026-10-17T19:00:00+08:00", participantCount: 2, section: "past" },
  { venueName: "Choa Chu Kang Tennis Centre", region: "West", startAt: "2026-10-14T09:00:00+08:00", endAt: "2026-10-14T10:00:00+08:00", participantCount: 4, section: "past" },
  { venueName: "Heartbeat@Bedok", region: "East", startAt: "2026-10-10T08:00:00+08:00", endAt: "2026-10-10T09:00:00+08:00", participantCount: 3, section: "past" },
  { venueName: "Yio Chu Kang Tennis Centre", region: "North", startAt: "2026-10-07T19:00:00+08:00", endAt: "2026-10-07T20:00:00+08:00", participantCount: 4, section: "past" },
  { venueName: "Kallang Tennis Hub", region: "Central", startAt: "2026-10-03T07:00:00+08:00", endAt: "2026-10-03T08:00:00+08:00", participantCount: 2, section: "past" },
];

function sessionsFor(role: SessionFeedItem["role"]): readonly SessionFeedItem[] {
  return examples.map((example, index) => ({
    ...example,
    sessionId: `54000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    sport: "Tennis",
    capacity: 4,
    bookingShareCents: 500,
    visibility: "PUBLIC",
    status: example.section === "upcoming" ? "OPEN" : "SETTLED",
    role,
    participationStatus: role === "PARTICIPANT" ? "COMMITTED" : null,
    unverifiedCount: 0,
  }));
}

export const joinedSessions = sessionsFor("PARTICIPANT");
export const hostedSessions = sessionsFor("HOST");
