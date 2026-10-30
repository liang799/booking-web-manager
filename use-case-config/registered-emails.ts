import { RegisteredEmailsUnavailableError, type RegisteredEmails } from "@/app/(auth)/register/registered-emails";
import { readSessionDatabaseUrl } from "@/app/sessions/server-environment";
import { createPostgresExecutor } from "@/lib/database/postgres-executor";
import { createPostgresPoolProvider } from "@/lib/database/postgres-pool";
import { PostgresRegisteredEmails } from "@/lib/supabase/postgres-registered-emails";

/**
 * Assembles sign-up's email check, a plain read used directly by the register action
 * (a technical capability under ADR-0016). Without DATABASE_URL it throws
 * RegisteredEmailsUnavailableError and sign-up relies on Supabase Auth alone.
 */
export function createRegisteredEmails(): RegisteredEmails {
  const databaseUrl = readSessionDatabaseUrl();
  if (databaseUrl === undefined) {
    return { hasAccount: async (): Promise<never> => { throw new RegisteredEmailsUnavailableError(); } };
  }
  return new PostgresRegisteredEmails(createPostgresExecutor(createPostgresPoolProvider(databaseUrl)));
}
