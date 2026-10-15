import { rootCertificates } from "node:tls";
import ConnectionParameters from "pg/lib/connection-parameters";
import { describe, expect, test } from "vitest";
import { postgresConnectionConfig } from "@/lib/database/postgres-pool";
import { SUPABASE_ROOT_CA_2021 } from "@/lib/database/supabase-root-ca";

const hosted = "postgresql://postgres.ref:p%24ss@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";

describe("postgresConnectionConfig", () => {
  test.each(["require", "verify-ca", "verify-full"])(
    "verifies sslmode=%s against public roots and Supabase's CA",
    (sslmode) => {
      const config = postgresConnectionConfig(`${hosted}?sslmode=${sslmode}&uselibpqcompat=true`);

      expect(config.connectionString).toBe(hosted);
      expect(config.ssl).toEqual({
        ca: [...rootCertificates, SUPABASE_ROOT_CA_2021],
        rejectUnauthorized: true,
      });
    },
  );

  test("pg keeps the verified TLS settings and the decoded credentials", () => {
    const parameters = new ConnectionParameters(postgresConnectionConfig(`${hosted}?sslmode=require`));

    expect(parameters.ssl).toMatchObject({ rejectUnauthorized: true });
    expect(parameters.host).toBe("aws-0-ap-southeast-1.pooler.supabase.com");
    expect(parameters.port).toBe(6543);
    expect(parameters.user).toBe("postgres.ref");
    expect(parameters.password).toBe("p$ss");
  });

  test.each([
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable",
  ])("leaves a connection without TLS unchanged: %s", (connectionString) => {
    expect(postgresConnectionConfig(connectionString)).toEqual({ connectionString });
  });

  test("embeds the Supabase root certificate", () => {
    expect(SUPABASE_ROOT_CA_2021).toMatch(/^-----BEGIN CERTIFICATE-----\n[\s\S]+\n-----END CERTIFICATE-----\n$/);
  });
});
