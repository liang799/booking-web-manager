import type { SessionInvitationPreviewDependencies } from "@/app/sessions/invitation-preview-server-dependencies";
import { SessionManagementUnavailableError } from "@/app/sessions/session-management-unavailable";
import { readSessionDatabaseUrl } from "@/app/sessions/server-environment";
import { createPostgresPoolProvider } from "@/lib/database/postgres-pool";
import { PostgresInvitedSessionReader } from "@/lib/sessions/postgres-invited-session-reader";
import { GetInvitedSession } from "@/use-cases/sessions/GetInvitedSession";

export function createSessionInvitationPreviewDependencies(): SessionInvitationPreviewDependencies {
  const databaseUrl = readSessionDatabaseUrl();
  const reader = databaseUrl === undefined
    ? { findByToken: async (): Promise<never> => { throw new SessionManagementUnavailableError(); } }
    : new PostgresInvitedSessionReader(createPostgresPoolProvider(databaseUrl));
  return { preview: new GetInvitedSession({ reader, clock: { now: () => new Date() } }) };
}
