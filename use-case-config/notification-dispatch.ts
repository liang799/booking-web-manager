import { readSessionServerSettings } from "@/app/sessions/server-environment";
import { readPushSettings } from "@/app/commit/push-environment";
import { createPostgresPoolProvider } from "@/lib/database/postgres-pool";
import { createPostgresExecutor } from "@/lib/database/postgres-executor";
import { PostgresNotificationPushStore } from "@/lib/notifications/postgres-notification-push-store";
import { NotificationPushDispatcher } from "@/lib/notifications/push-dispatcher";
import { createNotificationPushSender } from "@/lib/notifications/web-push-delivery";
import { NotificationsUnavailableError } from "@/app/notifications/dependencies";

class UnavailableDispatcher {
  async run(): Promise<never> { throw new NotificationsUnavailableError(); }
}

export function createNotificationDispatchDependencies() {
  const settings=readSessionServerSettings();
  if (!settings) return {cronSecret:process.env.CRON_SECRET ?? "",runner:new UnavailableDispatcher()};
  const getPool=createPostgresPoolProvider(settings.databaseUrl),push=readPushSettings();
  return {cronSecret:process.env.CRON_SECRET ?? "",runner:new NotificationPushDispatcher(
    new PostgresNotificationPushStore(createPostgresExecutor(getPool)),
    push ? createNotificationPushSender(push) : undefined,
  )};
}
