import type { SessionFeedDependencies } from "@/app/sessions/session-feed-dependencies";
import { SessionManagementUnavailableError } from "@/app/sessions/session-management-unavailable";
import { readSessionServerSettings } from "@/app/sessions/server-environment";
import { createPostgresExecutor } from "@/lib/database/postgres-executor";
import { createPostgresPoolProvider } from "@/lib/database/postgres-pool";
import { PostgresSessionFeedReader } from "@/lib/sessions/postgres-session-feed-reader";
import { createSupabaseIdentityAuthenticator } from "@/lib/supabase/bearer-auth";
import { createSupabaseCookieIdentityAuthenticator } from "@/lib/supabase/cookie-auth";
import { bearerOrLoginCookie } from "@/lib/supabase/request-authenticator";
import { ListSessionFeed } from "@/use-cases/sessions/ListSessionFeed";

export function createSessionFeedDependencies(): SessionFeedDependencies {
  const settings = readSessionServerSettings();
  if (!settings) {
    const unavailable = async (): Promise<never> => { throw new SessionManagementUnavailableError(); };
    return { authenticate: unavailable, sessionFeed: { list: unavailable } };
  }
  return {
    authenticate: bearerOrLoginCookie(
      createSupabaseIdentityAuthenticator(settings.supabaseUrl, settings.supabaseAnonKey),
      createSupabaseCookieIdentityAuthenticator(settings.supabaseUrl, settings.supabaseAnonKey),
    ),
    sessionFeed: new ListSessionFeed({
      reader: new PostgresSessionFeedReader(createPostgresExecutor(createPostgresPoolProvider(settings.databaseUrl))),
      clock: { now: () => new Date() },
    }),
  };
}
