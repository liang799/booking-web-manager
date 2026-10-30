import { readSessionServerSettings } from "@/app/sessions/server-environment";
import { NotificationsUnavailableError, type NotificationDependencies } from "@/app/notifications/dependencies";
import { createPostgresPoolProvider } from "@/lib/database/postgres-pool";
import { createNotificationInbox } from "@/lib/notifications/postgres";
import { createSupabaseSessionAuthenticator } from "@/lib/supabase/bearer-auth";
import { createSupabaseCookieSessionAuthenticator } from "@/lib/supabase/cookie-auth";
import { bearerOrLoginCookie } from "@/lib/supabase/request-authenticator";

export function createNotificationDependencies(): NotificationDependencies {
  const settings = readSessionServerSettings();
  if (!settings) {
    const unavailable = async (): Promise<never> => { throw new NotificationsUnavailableError(); };
    return { authenticate: unavailable, inbox: { list: unavailable } };
  }
  return {
    authenticate: bearerOrLoginCookie(
      createSupabaseSessionAuthenticator(settings.supabaseUrl, settings.supabaseAnonKey),
      createSupabaseCookieSessionAuthenticator(settings.supabaseUrl, settings.supabaseAnonKey),
    ),
    inbox: createNotificationInbox(createPostgresPoolProvider(settings.databaseUrl)),
  };
}
