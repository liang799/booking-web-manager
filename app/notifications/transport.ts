import { z } from "zod";
import { sendAsSignedInUser } from "@/app/commit/session-action-request";
import type { NotificationFilter } from "@/use-cases/notifications/notification-inbox";

const cursorSchema = z.object({ createdAt: z.string().datetime(), id: z.string().uuid() });
const pageSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(), category: z.enum(["bookings", "groups", "payments", "system"]),
    title: z.string(), body: z.string(), url: z.string().regex(/^\/(?!\/)/),
    createdAt: z.string().datetime(), readAt: z.string().datetime().nullable(),
  })),
  unreadCount: z.number().int().nonnegative(), nextCursor: cursorSchema.nullable(),
});
export type InboxPage = z.infer<typeof pageSchema>;
export type NotificationItem = InboxPage["items"][number];

export async function fetchNotifications(filter: NotificationFilter, before: InboxPage["nextCursor"], signal: AbortSignal): Promise<InboxPage> {
  const query = new URLSearchParams({ filter });
  if (before) { query.set("before", before.createdAt); query.set("id", before.id); }
  const response = await fetch(`/api/notifications?${query}`, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
  if (response.status === 401) throw new Error("Sign in again to see your notifications.");
  if (!response.ok) throw new Error("We couldn't load your notifications. Please try again.");
  return pageSchema.parse(await response.json());
}

export async function markNotificationRead(id: string): Promise<void> {
  const result = await sendAsSignedInUser("/api/notifications", { method: "PATCH", body: JSON.stringify({ id }) }, {
    unconfirmed: "We couldn't save your read status. Please try again.",
    signedOut: "Sign in again to update your notifications.",
  });
  if (result.status !== "sent") throw new Error(result.message);
  if (!result.response.ok) throw new Error("We couldn't save your read status. Please try again.");
  window.dispatchEvent(new Event("notifications:changed"));
}
