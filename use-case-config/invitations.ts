import type { SessionInvitationDependencies } from "@/app/sessions/invitation-dependencies";
import { SessionManagementUnavailableError } from "@/app/sessions/session-management-unavailable";
import { readSessionServerSettings } from "@/app/sessions/server-environment";
import { createPostgresPoolProvider } from "@/lib/database/postgres-pool";
import { PostgresSessionManagementTransaction } from "@/lib/sessions/postgres-session-management-transaction";
import { createSupabaseIdentityAuthenticator } from "@/lib/supabase/bearer-auth";
import { createSupabaseCookieIdentityAuthenticator } from "@/lib/supabase/cookie-auth";
import { bearerOrLoginCookie } from "@/lib/supabase/request-authenticator";
import { GetSessionInvitation } from "@/use-cases/sessions/GetSessionInvitation";

export function createSessionInvitationDependencies(): SessionInvitationDependencies {
  const settings = readSessionServerSettings();
  if (settings === undefined) {
    const unavailable = async (): Promise<never> => { throw new SessionManagementUnavailableError(); };
    return { authenticate: unavailable, invitation: { forBooker: unavailable } };
  }
  const clock = { now: () => new Date() };
  const transaction = new PostgresSessionManagementTransaction(createPostgresPoolProvider(settings.databaseUrl), clock);
  return {
    authenticate: bearerOrLoginCookie(
      createSupabaseIdentityAuthenticator(settings.supabaseUrl, settings.supabaseAnonKey),
      createSupabaseCookieIdentityAuthenticator(settings.supabaseUrl, settings.supabaseAnonKey),
    ),
    invitation: new GetSessionInvitation({ transaction, clock }),
  };
}
