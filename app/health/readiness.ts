import { readSessionServerSettings } from "@/app/sessions/server-environment";
import { createPostgresPoolProvider } from "@/lib/database/postgres-pool";

// Reuse one small database pool per warm runtime; do not open a new pool per probe.
// Bound this probe alone; session and financial queries keep their existing timeout policy.
const readinessQuery = { text: "select 1 from sessions limit 0", query_timeout: 1500 };
let databaseUrl: string | undefined;
let getPool: ReturnType<typeof createPostgresPoolProvider> | undefined;

/**
 * Checks server settings and session-table read access, without querying session
 * records or exposing configuration, credentials, or database failure details.
 * This does not establish live Auth or Stripe provider health.
 */
export async function isApiReady(): Promise<boolean> {
  try {
    const settings = readSessionServerSettings();
    if (settings === undefined) return false;
    if (getPool === undefined || databaseUrl !== settings.databaseUrl) {
      getPool = createPostgresPoolProvider(settings.databaseUrl);
      databaseUrl = settings.databaseUrl;
    }
    await getPool().query(readinessQuery);
    return true;
  } catch {
    return false;
  }
}
