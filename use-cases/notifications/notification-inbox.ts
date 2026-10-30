import type { UUID } from "@/domain";

export type NotificationFilter = "all" | "unread" | "bookings" | "groups" | "payments" | "system";
export interface InboxNotification {
  readonly id: UUID;
  readonly category: Exclude<NotificationFilter, "all" | "unread">;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly createdAt: Date;
  readonly readAt: Date | null;
}
export interface NotificationCursor { readonly createdAt: Date; readonly id: UUID }
export interface NotificationPage {
  readonly items: readonly InboxNotification[];
  readonly unreadCount: number;
  readonly nextCursor: NotificationCursor | null;
}

/** Recipient-scoped inbox; implementations enforce active-account access on every operation. */
export interface NotificationInbox {
  list(userId: UUID, filter: NotificationFilter, before?: NotificationCursor): Promise<NotificationPage>;
  markRead(userId: UUID, id: UUID | "all"): Promise<void>;
}
