import { readPushSettings } from "@/app/commit/push-environment";
import { readSessionServerSettings } from "@/app/sessions/server-environment";
import { NotificationsUnavailableError, type NotificationDependencies } from "@/app/notifications/dependencies";
import { createPostgresPoolProvider } from "@/lib/database/postgres-pool";
import { createWebPush } from "@/lib/commit/web-push";
import { InboxNotifier } from "@/lib/notifications/inbox-notifier";
import { createNotificationInbox } from "@/lib/notifications/postgres";
import { createSupabaseSessionAuthenticator } from "@/lib/supabase/bearer-auth";
import { createSupabaseCookieSessionAuthenticator } from "@/lib/supabase/cookie-auth";
import { bearerOrLoginCookie } from "@/lib/supabase/request-authenticator";
import type { Pool } from "pg";

export function createCommitmentNotifier(getPool: () => Pool) {
  const push = readPushSettings();
  return new InboxNotifier(createNotificationInbox(getPool), push ? createWebPush(getPool, push).notifier : undefined);
}

export function createNotificationDependencies(): NotificationDependencies {
  const settings = readSessionServerSettings();
  if (!settings) {
    const unavailable = async (): Promise<never> => { throw new NotificationsUnavailableError(); };
    return { authenticate: unavailable, inbox: { list: unavailable, markRead: unavailable } };
  }
  return {
    authenticate: bearerOrLoginCookie(
      createSupabaseSessionAuthenticator(settings.supabaseUrl, settings.supabaseAnonKey),
      createSupabaseCookieSessionAuthenticator(settings.supabaseUrl, settings.supabaseAnonKey),
    ),
    inbox: createNotificationInbox(createPostgresPoolProvider(settings.databaseUrl)),
  };
}
