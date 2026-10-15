import { rootCertificates } from "node:tls";
import { attachDatabasePool } from "@vercel/functions";
import { Pool, type PoolConfig } from "pg";
import { SUPABASE_ROOT_CA_2021 } from "./supabase-root-ca";

const urlTlsParameters = ["sslmode", "uselibpqcompat", "sslrootcert", "sslcert", "sslkey", "ssl"];

/**
 * TLS settings for a validated connection string. pg lets TLS parameters in the
 * URL override an explicit `ssl` option, so they are removed and replaced by full
 * verification against the public roots plus Supabase's own root CA.
 */
export function postgresConnectionConfig(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  const sslmode = url.searchParams.getAll("sslmode").at(-1);
  if (sslmode === undefined || sslmode === "disable") return { connectionString };
  for (const parameter of urlTlsParameters) url.searchParams.delete(parameter);
  return {
    connectionString: url.toString(),
    ssl: { ca: [...rootCertificates, SUPABASE_ROOT_CA_2021], rejectUnauthorized: true },
  };
}

/** Share connections within one runtime, opening the pool only for a parsed submission. */
export function createPostgresPoolProvider(
  connectionString: string,
): () => Pool {
  let pool: Pool | undefined;
  return () => {
    if (pool === undefined) {
      pool = new Pool({
        ...postgresConnectionConfig(connectionString),
        max: 2,
        min: 0,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 5000,
      });
      attachDatabasePool(pool);
      // An idle connection failure must not become an uncaught EventEmitter error.
      pool.on("error", () =>
        console.error(
          "Session database pool encountered an idle connection error",
        ),
      );
    }
    return pool;
  };
}
