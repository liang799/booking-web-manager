import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createDiscoveryDependencies } from "@/use-case-config/discovery";
import { DiscoveryApiUnavailableError } from "@/app/discover/discovery-api-unavailable";

const userId = "10000000-0000-4000-8000-000000000001";
const driver = vi.hoisted(() => ({
  query: vi.fn<(statement: string, values?: unknown[]) => Promise<{ rows: unknown[] }>>(),
  connect: vi.fn(), release: vi.fn(), getPool: vi.fn(), createPoolProvider: vi.fn(),
  createBearerAuthenticator: vi.fn(), createCookieAuthenticator: vi.fn(),
}));
vi.mock("@/lib/database/postgres-pool", () => ({ createPostgresPoolProvider: driver.createPoolProvider }));
vi.mock("@/lib/supabase/bearer-auth", () => ({ createSupabaseSessionAuthenticator: driver.createBearerAuthenticator }));
vi.mock("@/lib/supabase/cookie-auth", () => ({ createSupabaseCookieSessionAuthenticator: driver.createCookieAuthenticator }));

beforeEach(() => {
  vi.clearAllMocks();
  driver.query.mockReset().mockResolvedValue({ rows: [] });
  driver.connect.mockResolvedValue({ query: driver.query, release: driver.release });
  driver.getPool.mockReturnValue({ connect: driver.connect });
  driver.createPoolProvider.mockReturnValue(driver.getPool);
  driver.createBearerAuthenticator.mockReturnValue(vi.fn().mockResolvedValue(userId));
  driver.createCookieAuthenticator.mockReturnValue(vi.fn().mockResolvedValue(userId));
  vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:55322/postgres");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
});
afterEach(() => vi.unstubAllEnvs());

test("authenticated discovery composes bearer and cookie verification without eager DB connections", async () => {
  const dependencies = createDiscoveryDependencies();
  expect(driver.getPool).not.toHaveBeenCalled();
  const bearerRequest = new Request("http://localhost/api/sessions", {
    headers: { Authorization: "Bearer access-token" },
  });
  const cookieRequest = new Request("http://localhost/api/sessions");

  expect(await dependencies.authenticate(bearerRequest)).toBe(userId);
  expect(await dependencies.authenticate(cookieRequest)).toBe(userId);
  expect(driver.createBearerAuthenticator).toHaveBeenCalledExactlyOnceWith("http://127.0.0.1:54321", "test-anon-key");
  expect(driver.createCookieAuthenticator).toHaveBeenCalledExactlyOnceWith("http://127.0.0.1:54321", "test-anon-key");
  expect(driver.createBearerAuthenticator.mock.results[0]?.value).toHaveBeenCalledExactlyOnceWith(bearerRequest);
  expect(driver.createCookieAuthenticator.mock.results[0]?.value).toHaveBeenCalledExactlyOnceWith(cookieRequest);

  expect(await dependencies.discoverSessions.searchPublic()).toEqual([]);
  expect(driver.query.mock.calls).toEqual([
    ["begin isolation level repeatable read"],
    [expect.stringContaining("from sessions"), [expect.any(Date)]],
    ["commit"],
  ]);
  expect(driver.release).toHaveBeenCalledExactlyOnceWith(false);
});

test("rolls back listing failures and releases the connection", async () => {
  driver.query.mockImplementation(async (statement) => {
    if (statement.includes("from sessions")) throw new Error("Listing unavailable");
    return { rows: [] };
  });
  await expect(createDiscoveryDependencies().discoverSessions.searchPublic()).rejects.toThrow("Listing unavailable");
  expect(driver.query).toHaveBeenLastCalledWith("rollback");
  expect(driver.release).toHaveBeenCalledExactlyOnceWith(false);
});

test.each(["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"])(
  "missing %s keeps discovery unavailable without touching infrastructure", async (key) => {
    vi.stubEnv(key, "");
    const dependencies = createDiscoveryDependencies();
    await expect(dependencies.authenticate(new Request("http://localhost/api/sessions"))).rejects.toBeInstanceOf(DiscoveryApiUnavailableError);
    await expect(dependencies.discoverSessions.searchPublic()).rejects.toBeInstanceOf(DiscoveryApiUnavailableError);
    expect(driver.createPoolProvider).not.toHaveBeenCalled();
    expect(driver.createBearerAuthenticator).not.toHaveBeenCalled();
  },
);

test("invalid database settings fail setup instead of returning unavailable", () => {
  vi.stubEnv("DATABASE_URL", "postgresql://unsafe-remote.example/postgres");
  expect(createDiscoveryDependencies).toThrow();
});
