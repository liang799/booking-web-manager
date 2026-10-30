import type { NotificationInbox } from "@/use-cases/notifications/notification-inbox";

export interface NotificationDependencies {
  readonly authenticate: (request: Request) => Promise<string | null>;
  readonly inbox: NotificationInbox;
}

export class NotificationsUnavailableError extends Error {
  constructor() { super("Notifications are not available right now"); }
}
