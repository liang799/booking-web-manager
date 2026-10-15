import { discoveryErrorDiagnostics } from "@/app/discover/error-diagnostics";
import { describe, expect, test } from "vitest";

describe("public discovery error diagnostics", () => {
  test.each([
    "user=alice",
    "host=db.internal",
    "connect ECONNREFUSED 10.0.0.5:5432",
    "getaddrinfo ENOTFOUND db.internal.corp",
    "unlabelled-private-token",
    "postgresql://authority-user:authority%40secret@db.private.test/postgres?user=override-user&password=override%40secret",
    "authority-user authority@secret authority%40secret db.private.test",
    "override-user override@secret override%40secret",
    "Authorization: Basic unconfigured-secret",
    "Authorization: Bearer unconfigured-secret",
    "Cookie: session=unconfigured-secret; other=unconfigured-secret",
    "api_key=unconfigured-secret",
  ])("withholds unrecognized public diagnostic text: %s", (message) => {
    expect(discoveryErrorDiagnostics(new Error(message))).toEqual([{ message: "Unknown error" }]);
  });

  test.each([
    ["ECONNREFUSED", "Database connection refused"],
    ["ENOTFOUND", "Database hostname could not be resolved"],
    ["ERR_TLS_CERT_ALTNAME_INVALID", "Database TLS certificate does not match the hostname"],
    ["28P01", "Database password authentication failed"],
    ["42703", "Database column does not exist"],
  ])("uses fixed public text for recognized driver code %s", (code, message) => {
    const error = Object.assign(new Error("connect 10.0.0.5:5432 user=alice host=db.internal.corp"), {
      code, stack: "private-stack", detail: "private-row-detail", query: "select private-query",
    });
    expect(discoveryErrorDiagnostics(error)).toEqual([{ code, message }]);
  });

  test.each(["PRIVATE_INTERNAL_ACCOUNT", "ALICE", "__proto__", "constructor", "A".repeat(65)])(
    "withholds arbitrary codes, even if they match the old format: %s", (code) => {
      const error = Object.assign(new Error("user=alice"), { code });
      expect(discoveryErrorDiagnostics(error)).toEqual([{ message: "Unknown error" }]);
    },
  );

  test.each([
    "Connection terminated due to connection timeout",
    "timeout exceeded when trying to connect",
    "Connection terminated unexpectedly",
    "Query read timeout",
    "The server does not support SSL connections",
    "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string",
  ])("preserves an exact known driver message without a code: %s", (message) => {
    expect(discoveryErrorDiagnostics(new Error(message))).toEqual([{ message }]);
  });

  test.each([undefined, "XX000", "PRIVATE_INTERNAL_ACCOUNT"])(
    "preserves a known pooler message with code %s", (code) => {
      const error = Object.assign(new Error("Tenant or user not found"), { code });
      expect(discoveryErrorDiagnostics(error)).toEqual([
        { message: "Tenant or user not found", ...(code === "XX000" ? { code } : {}) },
      ]);
    },
  );

  test.each([
    "Tenant or user not found: alice",
    "Tenant or user not found\nuser=alice",
    "host=db.internal Connection terminated unexpectedly",
    "(ENOTFOUND) tenant/user alice.private-tenant not found",
  ])("does not accept near-matches with private context: %s", (message) => {
    expect(discoveryErrorDiagnostics(new Error(message))).toEqual([{ message: "Unknown error" }]);
  });

  test("retains a known TLS cause while withholding private wrapper context", () => {
    const cause = Object.assign(new Error("private certificate context"), { code: "SELF_SIGNED_CERT_IN_CHAIN" });
    const error = new Error("Failed connecting to db.internal as alice", { cause });
    expect(discoveryErrorDiagnostics(error)).toEqual([
      { message: "Unknown error" },
      { code: "SELF_SIGNED_CERT_IN_CHAIN", message: "self-signed certificate in certificate chain" },
    ]);
  });

  test("bounds nested, aggregate and cyclic causes", () => {
    const cycle = new Error("private-root");
    cycle.cause = cycle;
    expect(discoveryErrorDiagnostics(cycle)).toEqual([{ message: "Unknown error" }]);
    const aggregate = new AggregateError(Array.from({ length: 20 }, () => new Error("private-connection")), "private-aggregate");
    expect(discoveryErrorDiagnostics(aggregate)).toEqual(Array.from({ length: 8 }, () => ({ message: "Unknown error" })));
    let nested = new Error("private-leaf");
    for (let i = 0; i < 20; i++) nested = new Error("private-wrapper", { cause: nested });
    expect(discoveryErrorDiagnostics(nested)).toHaveLength(8);
  });

  test.each([undefined, null, 1, {}, { code: 42 }, "private-thrown-string"])("handles unsupported failures: %j", (error) => {
    expect(discoveryErrorDiagnostics(error)).toEqual([{ message: "Unknown error" }]);
  });

  test("handles a code without a message and known thrown strings", () => {
    expect(discoveryErrorDiagnostics({ code: "ECONNRESET" })).toEqual([
      { code: "ECONNRESET", message: "Database connection reset" },
    ]);
    expect(discoveryErrorDiagnostics("Tenant or user not found")).toEqual([{ message: "Tenant or user not found" }]);
  });

  test("does not return any part of oversized, multiline or quoted unknown messages", () => {
    for (const message of ["x".repeat(16_001), "Query failed\nSELECT private_data\n at /private/server.ts:10", 'private"quoted"suffix']) {
      expect(discoveryErrorDiagnostics(new Error(message))).toEqual([{ message: "Unknown error" }]);
    }
  });
});
