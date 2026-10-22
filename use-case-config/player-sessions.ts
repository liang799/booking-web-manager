import type { PlayerSessionsDependencies } from "@/app/commit/player-sessions-dependencies";
import { SessionManagementUnavailableError } from "@/app/sessions/session-management-unavailable";
import { readSessionServerSettings } from "@/app/sessions/server-environment";
import { PostgresJoinedSessionsReader } from "@/lib/commit/postgres-joined-sessions-reader";
import { PostgresReplacementInvitationsReader } from "@/lib/commit/postgres-replacement-invitations-reader";
import { createPostgresExecutor } from "@/lib/database/postgres-executor";
import { createPostgresPoolProvider } from "@/lib/database/postgres-pool";
import { createSupabaseIdentityAuthenticator } from "@/lib/supabase/bearer-auth";
import { ListJoinedSessions } from "@/use-cases/sessions/ListJoinedSessions";
import { ListReplacementInvitations } from "@/use-cases/sessions/ListReplacementInvitations";

/**
 * Assembles the player's UC2-05 lists over plain reads; nothing is saved.
 * Without server settings every call reports SESSION_MANAGEMENT_UNAVAILABLE.
 */
export function createPlayerSessionsDependencies(): PlayerSessionsDependencies {
  const settings = readSessionServerSettings();
  if (!settings) {
    const unavailable = async (): Promise<never> => {
      throw new SessionManagementUnavailableError();
    };
    return {
      authenticate: unavailable,
      listJoinedSessions: { forParticipant: unavailable },
      listReplacementInvitations: { forInvitee: unavailable },
    };
  }
  const sql = createPostgresExecutor(createPostgresPoolProvider(settings.databaseUrl));
  const clock = { now: () => new Date() };
  return {
    authenticate: createSupabaseIdentityAuthenticator(
      settings.supabaseUrl,
      settings.supabaseAnonKey,
    ),
    listJoinedSessions: new ListJoinedSessions({
      reader: new PostgresJoinedSessionsReader(sql),
      clock,
    }),
    listReplacementInvitations: new ListReplacementInvitations({
      reader: new PostgresReplacementInvitationsReader(sql),
      clock,
    }),
  };
}
