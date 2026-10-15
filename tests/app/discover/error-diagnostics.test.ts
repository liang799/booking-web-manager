import { discoveryErrorDiagnostics } from "@/app/discover/error-diagnostics";
import { describe, expect, test } from "vitest";

describe("public discovery error diagnostics", () => {
  test("preserves useful pooler messages", () => {
    expect(discoveryErrorDiagnostics(new Error("Tenant or user not found"), {})).toEqual([
      { message: "Tenant or user not found" },
    ]);
  });

  test("redacts encoded credentials and PostgreSQL query-parameter overrides", () => {
    const environment = {
      DATABASE_URL: "postgresql://authority-user:authority%40secret@db.private.test/postgres?user=override-user&password=override%40secret",
    };
    const messages = [
      environment.DATABASE_URL,
      "authority-user authority@secret authority%40secret db.private.test",
      "override-user override@secret override%40secret",
    ];
    for (const message of messages) {
      const [diagnostic] = discoveryErrorDiagnostics(new Error(message), environment);
      expect(diagnostic?.message.replaceAll("[REDACTED]", "").trim()).toBe("");
    }
  });

  test("redacts PostgreSQL's standard credential environment variables", () => {
    expect(discoveryErrorDiagnostics(new Error("private-pg-user private-pg-password"), {
      PGUSER: "private-pg-user", PGPASSWORD: "private-pg-password",
    })).toEqual([{ message: "[REDACTED] [REDACTED]" }]);
  });

  test("recognizes credential labels before masking short configured values", () => {
    const result = discoveryErrorDiagnostics(new Error("api_key=unknown-secret-value"), {
      DATABASE_URL: "postgresql://key:known-password@db.private.test/postgres",
    });
    expect(JSON.stringify(result)).not.toContain("unknown-secret-value");
  });

  test("masks complete configured URLs before interpreting whitespace inside them", () => {
    const DATABASE_URL = "postgres://dbuser:secret word@db.private/postgres";
    expect(discoveryErrorDiagnostics(new Error(`Failed connecting to ${DATABASE_URL}`), { DATABASE_URL })).toEqual([
      { message: "Failed connecting to [REDACTED]" },
    ]);
  });

  test("recognizes URLs even when configured credentials match their protocol", () => {
    expect(discoveryErrorDiagnostics(new Error("connect postgresql://external:unconfigured@unknown-host/postgres"), {
      DATABASE_URL: "postgresql://postgres:configured@db.private/postgres",
    })).toEqual([{ message: "connect [REDACTED]" }]);
  });

  test("redacts overlapping quoted text and configured secrets without leaving fragments", () => {
    expect(discoveryErrorDiagnostics(new Error('secret"quoted"suffix'), {
      API_KEY: 'secret"quoted"suffix',
    })).toEqual([{ message: "[REDACTED]" }]);
  });

  test("redacts complete values before limiting the visible message length", () => {
    for (const value of [
      "postgresql://user:private-password@db.private.test/postgres",
      '"private quoted detail"',
      "password=private-password",
      "Bearer private-bearer",
      "private-configured-secret",
    ]) {
      const [diagnostic] = discoveryErrorDiagnostics(new Error(`${"x".repeat(480)} ${value}`), {
        SERVICE_SECRET: "private-configured-secret",
      });
      expect(diagnostic?.message.length).toBeLessThanOrEqual(500);
      expect(diagnostic?.message).not.toContain("private");
    }
  });

  test("omits credential-bearing and arbitrary codes", () => {
    for (const code of ["SECRET_API_VALUE", "password=unconfigured", "A".repeat(65)]) {
      expect(discoveryErrorDiagnostics(Object.assign(new Error("Failed"), { code }), {
        API_KEY: "SECRET_API_VALUE",
      })).toEqual([{ message: "Failed" }]);
    }
  });

  test("redacts unconfigured URL credentials, authorization and cookie values", () => {
    for (const message of [
      "connect postgres://user:unconfigured-secret@private-host/postgres",
      "Authorization: Basic unconfigured-secret",
      "Authorization: Bearer unconfigured-secret",
      "Cookie: session=unconfigured-secret; other=unconfigured-secret",
      "password='unconfigured-secret with spaces'",
      "api_key=unconfigured-secret",
    ]) {
      const result = JSON.stringify(discoveryErrorDiagnostics(new Error(message), {}));
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("unconfigured-secret");
    }
  });

  test("does not return multiline stack or SQL continuations", () => {
    expect(discoveryErrorDiagnostics(new Error("Query failed\nSELECT private_data\n at /private/server.ts:10"), {})).toEqual([
      { message: "Query failed" },
    ]);
  });

  test("bounds nested, aggregate and cyclic causes", () => {
    const cycle = new Error("Root failure");
    cycle.cause = cycle;
    expect(discoveryErrorDiagnostics(cycle, {})).toEqual([{ message: "Root failure" }]);
    const aggregate = new AggregateError(Array.from({ length: 20 }, () => new Error("Connection failed")), "All connections failed");
    expect(discoveryErrorDiagnostics(aggregate, {})).toHaveLength(8);
    let nested = new Error("Leaf failure");
    for (let i = 0; i < 20; i++) nested = new Error("Wrapper failure", { cause: nested });
    expect(discoveryErrorDiagnostics(nested, {})).toHaveLength(8);
  });

  test.each([undefined, null, 1, {}, { code: "ECONNRESET" }])("handles non-Error failures: %j", (error) => {
    expect(discoveryErrorDiagnostics(error, {})).toEqual([
      { message: "Unknown error", ...(typeof error === "object" && error !== null && "code" in error ? { code: error.code } : {}) },
    ]);
  });

  test("redacts thrown strings and bounds oversized messages", () => {
    expect(discoveryErrorDiagnostics("Failed: token=private-token", {})).toEqual([{ message: "Failed: token=[REDACTED]" }]);
    expect(discoveryErrorDiagnostics(new Error("x".repeat(16_001)), {})).toEqual([{ message: "Error message omitted because it is too long" }]);
  });
});
