import type { DiscoveryDependencies } from "@/app/discover/dependencies";
import { DiscoveryApiUnavailableError } from "@/app/discover/discovery-api-unavailable";
import { readSessionServerSettings } from "@/app/sessions/server-environment";
import { createPostgresPoolProvider } from "@/lib/database/postgres-pool";
import { createSupabaseIdentityAuthenticator } from "@/lib/supabase/bearer-auth";
import { createSupabaseCookieIdentityAuthenticator } from "@/lib/supabase/cookie-auth";
import { bearerOrLoginCookie } from "@/lib/supabase/request-authenticator";
import { PostgresSessionDiscoveryTransaction } from "@/lib/sessions/postgres-session-discovery-transaction";
import { DiscoverSessions } from "@/use-cases/sessions/DiscoverSessions";

export function createDiscoveryDependencies(): DiscoveryDependencies {
  const settings = readSessionServerSettings();
  if (settings === undefined) {
    const unavailable = async (): Promise<never> => { throw new DiscoveryApiUnavailableError(); };
    return { authenticate: unavailable, discoverSessions: { searchPublic: unavailable } };
  }
  const getPool = createPostgresPoolProvider(settings.databaseUrl);
  // Query validation happens before the first database pool is opened.
  const clock = { now: () => new Date() };
  return {
    authenticate: bearerOrLoginCookie(
      createSupabaseIdentityAuthenticator(settings.supabaseUrl, settings.supabaseAnonKey),
      createSupabaseCookieIdentityAuthenticator(settings.supabaseUrl, settings.supabaseAnonKey),
    ),
    discoverSessions: new DiscoverSessions({
      transaction: new PostgresSessionDiscoveryTransaction(getPool),
      clock,
    }),
  };
}
