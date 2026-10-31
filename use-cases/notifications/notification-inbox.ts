import type { UUID } from "@/domain";

export type NotificationFilter = "all" | "bookings" | "groups" | "payments" | "system";
export interface InboxNotification {
  readonly id: UUID;
  readonly category: Exclude<NotificationFilter, "all">;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly createdAt: Date;
}
export interface NotificationCursor { readonly createdAt: Date; readonly id: UUID }
export interface NotificationPage {
  readonly items: readonly InboxNotification[];
  readonly retentionCutoff: Date;
  readonly nextCursor: NotificationCursor | null;
}

/** Recipient-scoped inbox; implementations enforce active-account access on every operation. */
export interface NotificationInbox {
  list(userId: UUID, filter: NotificationFilter, before?: NotificationCursor): Promise<NotificationPage>;
}
