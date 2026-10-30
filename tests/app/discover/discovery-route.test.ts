import type { DiscoveryDependencies } from "@/app/discover/dependencies";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const configuration = vi.hoisted(() => ({ createDiscoveryDependencies: vi.fn<() => DiscoveryDependencies>() }));
vi.mock("@/use-case-config/discovery", () => configuration);
const userId = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.resetModules();
  configuration.createDiscoveryDependencies.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function scenario() {
  const searchPublic = vi.fn<DiscoveryDependencies["discoverSessions"]["searchPublic"]>().mockResolvedValue([]);
  const authenticate = vi.fn<DiscoveryDependencies["authenticate"]>().mockResolvedValue(userId);
  configuration.createDiscoveryDependencies.mockReturnValue({ authenticate, discoverSessions: { searchPublic } });
  const { GET } = await import("@/app/api/sessions/route");
  const { DomainError } = await import("@/domain");
  const { DiscoveryApiUnavailableError } = await import("@/app/discover/discovery-api-unavailable");
  return { searchPublic, GET, DomainError, DiscoveryApiUnavailableError };
}

const request = (query = "") => new Request(`http://localhost/api/sessions?${query}`, { headers: { authorization: "Bearer token" } });

describe("GET /api/sessions", () => {
  test("adds response-time clock metadata without changing the successful JSON projection", async () => {
    const { GET, searchPublic } = await scenario();
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    searchPublic.mockImplementation(async () => {
      clock.mockReturnValue(1_800_000_000_250);
      return [];
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-server-time")).toBe("1800000000250");
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
  });

  test("returns the underlying TLS error without requiring access to server logs", async () => {
    const { GET, searchPublic } = await scenario();
    const cause = Object.assign(new Error("self-signed certificate in certificate chain"), {
      code: "SELF_SIGNED_CERT_IN_CHAIN",
    });
    searchPublic.mockRejectedValue(new Error("Route dependencies could not be loaded", { cause }));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-server-time")).toBeNull();
    expect(body.error.diagnostics).toEqual([
      { message: "Route dependencies could not be loaded" },
      { code: "SELF_SIGNED_CERT_IN_CHAIN", message: "self-signed certificate in certificate chain" },
    ]);
  });

  test("withholds credentials in cause messages and omits stacks, SQL and provider detail fields", async () => {
    const { GET, searchPublic } = await scenario();
    vi.stubEnv("DATABASE_URL", "postgresql://private-user:p%40ss-secret@db.private.test/postgres?sslmode=require");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "private-service-role-key");
    const cause = Object.assign(new Error("password authentication failed for user \"private-user\"; password=p@ss-secret; token=unconfigured-token; Authorization: Bearer unconfigured-bearer; private-service-role-key"), {
      code: "28P01", detail: "private-row-detail", query: "select private-query", stack: "private-stack",
    });
    searchPublic.mockRejectedValue(new Error(`Failed connecting to ${process.env.DATABASE_URL}`, { cause }));

    const body = await (await GET(request())).json();

    expect(body.error.diagnostics).toEqual([
      { message: "Unknown error" },
      { code: "28P01", message: "Database password authentication failed" },
    ]);
    for (const secret of ["private-user", "p@ss-secret", "p%40ss-secret", "db.private.test", "unconfigured-token", "unconfigured-bearer", "private-service-role-key", "private-row-detail", "private-query", "private-stack"]) {
      expect(JSON.stringify(body)).not.toContain(secret);
    }
  });

  test("withholds unconfigured topology and arbitrary codes from authenticated callers", async () => {
    const { GET, searchPublic } = await scenario();
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND db.internal.corp"), { code: "ENOTFOUND" });
    const failure = Object.assign(new Error("user=alice host=db.internal 10.0.0.5:5432"), {
      code: "PRIVATE_INTERNAL_ACCOUNT", cause,
    });
    searchPublic.mockRejectedValue(failure);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.diagnostics).toEqual([
      { message: "Unknown error" },
      { code: "ENOTFOUND", message: "Database hostname could not be resolved" },
    ]);
    for (const value of ["alice", "db.internal", "10.0.0.5", "5432", "PRIVATE_INTERNAL_ACCOUNT"]) {
      expect(JSON.stringify(body)).not.toContain(value);
    }
  });

  test("returns useful messages for connection timeouts without driver codes", async () => {
    const { GET, searchPublic } = await scenario();
    searchPublic.mockRejectedValue(new Error("Connection terminated due to connection timeout"));

    expect(await (await GET(request())).json()).toMatchObject({ error: {
      diagnostics: [{ message: "Connection terminated due to connection timeout" }],
    } });
  });

  test("explains a database schema failure and correlates the response with server logs", async () => {
    const { GET, searchPublic } = await scenario();
    const failure = Object.assign(new Error('column "private_column" does not exist'), { code: "42703" });
    searchPublic.mockRejectedValue(failure);
    const response = await GET(request("q=Jurong&sport=Basketball&region=East&date=2040-01-02&timeFrom=18%3A00&timeTo=20%3A00&cursor=eyJzdGFydEF0IjoiMjA0MC0wMS0wMlQxMDowMDowMC4wMDBaIiwic2Vzc2lvbklkIjoiMTExMTExMTEtMTExMS00MTExLTgxMTEtMDAwMDAwMDAwMDIwIn0"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ error: {
      code: "INTERNAL_ERROR",
      message: "The sessions database schema does not match this deployment. Check that database migrations have been applied.",
      requestId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
      reason: "DATABASE_SCHEMA_MISMATCH",
      stage: "query",
      diagnostics: [{ code: "42703", message: "Database column does not exist" }],
    } });
    expect(response.headers.get("x-request-id")).toBe(body.error.requestId);
    expect(console.error).toHaveBeenCalledExactlyOnceWith("Session discovery failed", {
      requestId: body.error.requestId, method: "GET", path: "/api/sessions",
      reason: "DATABASE_SCHEMA_MISMATCH", stage: "query", error: failure,
    });
    expect(JSON.stringify(body)).not.toContain("private");
  });

  test.each([
    ["ECONNREFUSED", "DATABASE_UNAVAILABLE", "connectivity"],
    ["08006", "DATABASE_UNAVAILABLE", "connectivity"],
    ["28P01", "DATABASE_ACCESS_DENIED", "credentials and permissions"],
    ["42501", "DATABASE_ACCESS_DENIED", "credentials and permissions"],
    ["42P01", "DATABASE_SCHEMA_MISMATCH", "migrations"],
    ["42883", "DATABASE_SCHEMA_MISMATCH", "migrations"],
  ])("gives safe guidance for database error %s", async (code, reason, guidance) => {
    const { GET, searchPublic } = await scenario();
    searchPublic.mockRejectedValue(Object.assign(new Error('Provider rejected "private detail"'), { code }));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatchObject({ code: "INTERNAL_ERROR", reason, stage: "query" });
    expect(body.error.message).toContain(guidance);
    expect(JSON.stringify(body)).not.toContain("private");
    expect(body.error.diagnostics).toEqual([{ code, message: expect.any(String) }]);
  });

  test("recognizes a wrapped database failure during initialization and retains the cause in logs", async () => {
    const { GET } = await scenario();
    const cause = Object.assign(new Error("connect ECONNREFUSED postgresql://private:private@private/postgres"), { code: "ECONNREFUSED" });
    const failure = new Error("Discovery setup failed", { cause });
    configuration.createDiscoveryDependencies.mockImplementationOnce(() => { throw failure; });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatchObject({ reason: "DATABASE_UNAVAILABLE", stage: "initialization" });
    expect(JSON.stringify(body)).not.toContain("private");
    expect(console.error).toHaveBeenCalledExactlyOnceWith("Session discovery failed", expect.objectContaining({
      requestId: body.error.requestId, error: expect.objectContaining({ cause: failure }),
    }));
  });

  test("uses a distinct server-generated ID for each failed request", async () => {
    const { GET, searchPublic } = await scenario();
    searchPublic.mockRejectedValue(new Error("private failure"));
    const req = new Request("http://localhost/api/sessions?q=private", { headers: {
      "X-Request-Id": "untrusted-caller-id", authorization: "Bearer private-token",
    } });

    const first = await GET(req);
    const second = await GET(req);
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(firstBody.error.requestId).not.toBe("untrusted-caller-id");
    expect(firstBody.error.requestId).not.toBe(secondBody.error.requestId);
    expect(first.headers.get("x-request-id")).toBe(firstBody.error.requestId);
    expect(second.headers.get("x-request-id")).toBe(secondBody.error.requestId);
    expect(console.error).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private-token");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("?q=");
  });

  test.each([undefined, null, "token=private-failure", { code: "UNKNOWN", message: "token=private-failure" }])(
    "handles unrecognized thrown values without leaking credentials: %j", async (failure) => {
      const { GET, searchPublic } = await scenario();
      searchPublic.mockRejectedValue(failure);

      const response = await GET(request());
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toMatchObject({ reason: "UNEXPECTED_ERROR", stage: "query" });
      expect(body.error.message).toContain("could not load sessions");
      expect(JSON.stringify(body)).not.toContain("private");
    },
  );

  test("handles a cyclic error cause without hanging", async () => {
    const { GET, searchPublic } = await scenario();
    const failure = new Error("private failure");
    failure.cause = failure;
    searchPublic.mockRejectedValue(failure);

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: { reason: "UNEXPECTED_ERROR", stage: "query" } });
  });

  test("identifies response serialization failures separately from database reads", async () => {
    const { GET, searchPublic } = await scenario();
    searchPublic.mockResolvedValue([{ sessionId: userId, venueName: "Sports hall", sport: "Badminton", region: "West", startAt: new Date("invalid"), endAt: new Date("2030-01-02T12:00:00Z"), totalSlots: 8, bookingShareCents: 333 }]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatchObject({ reason: "UNEXPECTED_ERROR", stage: "serialization" });
    expect(body.error.message).toContain("could not prepare the response");
  });

  test("imports without assembling dependencies or authenticating", async () => {
    const { searchPublic } = await scenario();

    expect(configuration.createDiscoveryDependencies).not.toHaveBeenCalled();
    expect(searchPublic).not.toHaveBeenCalled();
  });

  test("invokes authenticated discovery with validated filter bounds", async () => {
    const { GET, searchPublic } = await scenario();
    const req = request("q=+Jurong+&sport=Badminton&region=West&date=2030-01-02&timeFrom=18:00&timeTo=20:00");
    const response = await GET(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
    expect(searchPublic).toHaveBeenCalledExactlyOnceWith({ text: "Jurong", sport: "Badminton", region: "West", startsWithin: { from: new Date("2030-01-02T10:00:00Z"), before: new Date("2030-01-02T12:00:00Z") } }, userId);
  });

  test("serializes safe listing fields and creates an opaque cursor for further matches", async () => {
    const { GET, searchPublic } = await scenario();
    const item = { sessionId: userId, venueName: "Sports hall", sport: "Badminton", region: "West", startAt: new Date("2030-01-02T10:00:00Z"), endAt: new Date("2030-01-02T12:00:00Z"), totalSlots: 8, bookingShareCents: 333, roomToken: "private", bookerId: "private" };
    const sessions = Array.from({ length: 21 }, (_, index) => ({ ...item, sessionId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` }));
    searchPublic.mockResolvedValue(sessions);
    const body = await (await GET(request())).json();
    expect(body.items).toHaveLength(20);
    expect(body.items[0]).toEqual({ sessionId: userId, venueName: "Sports hall", sport: "Badminton", region: "West", startAt: "2030-01-02T10:00:00.000Z", endAt: "2030-01-02T12:00:00.000Z", totalSlots: 8, bookingShareCents: 333 });
    expect(body.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(JSON.parse(atob(body.nextCursor.replace(/-/g, "+").replace(/_/g, "/")))).toEqual({ startAt: item.startAt.toISOString(), sessionId: sessions[19]?.sessionId });
    expect(JSON.stringify(body)).not.toContain("private");
  });

  test("applies an existing HTTP cursor after obtaining matches without paging arguments", async () => {
    const { GET, searchPublic } = await scenario();
    const payload = { startAt: "2030-01-02T10:00:00.000Z", sessionId: userId };
    const nextId = "10000000-0000-4000-8000-000000000002";
    const item = { sessionId: userId, venueName: "Sports hall", sport: "Badminton", region: "West", startAt: new Date(payload.startAt), endAt: new Date("2030-01-02T12:00:00Z"), totalSlots: 8, bookingShareCents: 333 };
    searchPublic.mockResolvedValue([item, { ...item, sessionId: nextId }]);
    const cursor = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const response = await GET(request(`cursor=${cursor}`));
    expect(response.status).toBe(200);
    expect(searchPublic).toHaveBeenCalledExactlyOnceWith({}, userId);
    expect(await response.json()).toMatchObject({ items: [{ sessionId: nextId }], nextCursor: null });
  });

  test.each(["q=one&q=two", `q=${"a".repeat(101)}`, "sport=Badminton&sport=Tennis", "region=South", "timeTo=19:00", "date=2030-02-30", "cursor=bad"])("rejects invalid query %s before reading the database", async (query) => {
    const { GET, searchPublic } = await scenario();
    searchPublic.mockRejectedValue(new Error("Database must not be read"));
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-server-time")).toBeNull();
    expect(await response.json()).toEqual({ error: { code: "INVALID_REQUEST", message: "Invalid session discovery query" } });
    expect(searchPublic).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  test("returns the exact unavailable contract", async () => {
    const { GET, searchPublic, DiscoveryApiUnavailableError } = await scenario();
    searchPublic.mockRejectedValue(new DiscoveryApiUnavailableError());
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("x-server-time")).toBeNull();
    expect(await response.json()).toEqual({ error: { code: "DISCOVERY_API_UNAVAILABLE", message: "Session discovery is not available yet" } });
    expect(console.error).not.toHaveBeenCalled();
  });

  test.each(["Error", "DomainError", "DiscoveryApiUnavailableError"])(
    "redacts dependency assembly %s before query execution and retries setup",
    async (kind) => {
      const { GET, searchPublic, DomainError, DiscoveryApiUnavailableError } = await scenario();
      const failure = kind === "DomainError"
        ? new DomainError("INACTIVE_ACCOUNT", "token=private-discovery-setup-failure")
        : kind === "DiscoveryApiUnavailableError"
          ? new DiscoveryApiUnavailableError()
          : new Error("token=private-discovery-setup-failure");
      configuration.createDiscoveryDependencies.mockImplementationOnce(() => { throw failure; });

      const response = await GET(request());

      expect(response.status).toBe(500);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: {
        code: "INTERNAL_ERROR",
        message: "Session discovery could not initialize. Check the deployment configuration and server logs using the request ID.",
        requestId: expect.any(String), reason: "INITIALIZATION_FAILED", stage: "initialization",
        diagnostics: [
          { message: "Route dependencies could not be loaded" },
          {
            message: kind === "DiscoveryApiUnavailableError" ? "Session discovery is not available yet" : "Unknown error",
          },
        ],
      } });
      expect(searchPublic).not.toHaveBeenCalled();

      const recovered = await GET(request());
      expect(recovered.status).toBe(200);
      expect(configuration.createDiscoveryDependencies).toHaveBeenCalledTimes(2);
      expect(searchPublic).toHaveBeenCalledOnce();
    },
  );

  test.each(["searchPublic", "setup"])("redacts %s failures", async (stage) => {
    const { GET, searchPublic } = await scenario();
    const error = new Error("token=private-database-or-provider-secret");
    if (stage === "searchPublic") searchPublic.mockRejectedValue(error);
    if (stage === "setup") configuration.createDiscoveryDependencies.mockImplementation(() => { throw error; });
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: {
      code: "INTERNAL_ERROR",
      message: stage === "setup"
        ? "Session discovery could not initialize. Check the deployment configuration and server logs using the request ID."
        : "Session discovery could not load sessions. Retry shortly; if this persists, check server logs using the request ID.",
      requestId: expect.any(String),
      reason: stage === "setup" ? "INITIALIZATION_FAILED" : "UNEXPECTED_ERROR",
      stage: stage === "setup" ? "initialization" : "query",
      diagnostics: [
        ...(stage === "setup" ? [{ message: "Route dependencies could not be loaded" }] : []),
        { message: "Unknown error" },
      ],
    } });
  });
});
