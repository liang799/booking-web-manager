import { z } from "zod";
import type { UUID } from "@/domain";
import { invalidRequest } from "@/app/http/request-failure";
import type { SessionFeedPage, SessionFeedPosition } from "@/use-cases/sessions/ListSessionFeed";
import { sessionFeedTabSchema, type SessionFeedResponse, type SessionFeedTab } from "./session-feed-contract";

const timestamp = z.string().datetime({ offset: true });
const cursorSchema = z.object({
  version: z.literal(1),
  userId: z.string().uuid(),
  tab: sessionFeedTabSchema,
  asOf: timestamp,
  section: z.enum(["upcoming", "past"]),
  startAt: timestamp,
  sessionId: z.string().uuid(),
}).strict();
const querySchema = z.object({
  tab: sessionFeedTabSchema.default("joined"),
  cursor: z.string().min(1).max(2048).optional(),
}).strict();

/** Cursors select a position only. The authenticated identity always controls data access. */
export function parseSessionFeedInput(request: Request, userId: UUID): {
  tab: SessionFeedTab;
  asOf?: Date;
  after?: SessionFeedPosition;
} {
  const parameters = new URL(request.url).searchParams;
  if ([...parameters.keys()].some((key) => parameters.getAll(key).length !== 1)) throw invalidRequest("Invalid sessions query");
  const parsed = querySchema.safeParse(Object.fromEntries(parameters));
  if (!parsed.success) throw invalidRequest("Invalid sessions query");
  if (!parsed.data.cursor) return { tab: parsed.data.tab };
  let decoded: unknown;
  try { decoded = JSON.parse(Buffer.from(parsed.data.cursor, "base64url").toString("utf8")); } catch {
    throw invalidRequest("Invalid sessions cursor");
  }
  const cursor = cursorSchema.safeParse(decoded);
  if (!cursor.success || cursor.data.userId !== userId || cursor.data.tab !== parsed.data.tab) {
    throw invalidRequest("Invalid sessions cursor");
  }
  return {
    tab: cursor.data.tab,
    asOf: new Date(cursor.data.asOf),
    after: { section: cursor.data.section, startAt: new Date(cursor.data.startAt), sessionId: cursor.data.sessionId },
  };
}

export function toSessionFeedResponse(page: SessionFeedPage, userId: UUID, tab: SessionFeedTab): SessionFeedResponse {
  return {
    sessions: page.sessions.map((session) => ({
      sessionId: session.sessionId, venueName: session.venueName, sport: session.sport, region: session.region,
      startAt: session.startAt.toISOString(), endAt: session.endAt.toISOString(),
      capacity: session.capacity, participantCount: session.participantCount, bookingShareCents: session.bookingShareCents,
      visibility: session.visibility, status: session.status, role: session.role,
      participationStatus: session.participationStatus, section: session.section, unverifiedCount: session.unverifiedCount,
    })),
    asOf: page.asOf.toISOString(),
    upcomingCount: page.upcomingCount,
    pastCount: page.pastCount,
    nextCursor: page.next ? Buffer.from(JSON.stringify({
      version: 1, userId, tab, asOf: page.asOf.toISOString(),
      section: page.next.section, startAt: page.next.startAt.toISOString(), sessionId: page.next.sessionId,
    })).toString("base64url") : null,
  };
}
