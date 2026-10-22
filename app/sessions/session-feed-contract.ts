import { z } from "zod";

const timestamp = z.string().datetime({ offset: true });

export const sessionFeedTabSchema = z.enum(["joined", "hosting"]);
export type SessionFeedTab = z.infer<typeof sessionFeedTabSchema>;

/** Only the signed-in user's session facts; never invitation tokens or participant identities. */
export const sessionFeedItemSchema = z.object({
  sessionId: z.string().uuid(),
  venueName: z.string(),
  sport: z.string(),
  region: z.string(),
  startAt: timestamp,
  endAt: timestamp,
  capacity: z.number().int().positive(),
  participantCount: z.number().int().nonnegative(),
  bookingShareCents: z.number().int().safe().positive(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  status: z.enum(["OPEN", "CANCELLED", "AWAITING_PAYOUT", "PAYOUT_PENDING", "SETTLED"]),
  role: z.enum(["HOST", "PARTICIPANT"]),
  participationStatus: z.enum(["WAITLISTED", "COMMITTED", "LEFT_WAITLIST", "WITHDRAWN", "REMOVED", "CANCELLED"]).nullable(),
  section: z.enum(["upcoming", "past"]),
  unverifiedCount: z.number().int().nonnegative(),
});

export const sessionFeedResponseSchema = z.object({
  sessions: z.array(sessionFeedItemSchema),
  nextCursor: z.string().min(1).nullable(),
  asOf: timestamp,
  upcomingCount: z.number().int().nonnegative(),
  pastCount: z.number().int().nonnegative(),
});

export type SessionFeedItem = z.infer<typeof sessionFeedItemSchema>;
export type SessionFeedResponse = z.infer<typeof sessionFeedResponseSchema>;
