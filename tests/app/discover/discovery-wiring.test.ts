import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createDiscoveryDependencies } from "@/use-case-config/discovery";
import { DiscoveryApiUnavailableError } from "@/app/discover/discovery-api-unavailable";

const driver = vi.hoisted(() => ({
  query: vi.fn<(statement: string, values?: unknown[]) => Promise<{ rows: unknown[] }>>(),
  connect: vi.fn(), release: vi.fn(), getPool: vi.fn(), createPoolProvider: vi.fn(), createAuthenticator: vi.fn(), createCookieAuthenticator: vi.fn(),
}));
vi.mock("@/lib/database/postgres-pool", () => ({ createPostgresPoolProvider: driver.createPoolProvider }));
vi.mock("@/lib/supabase/bearer-auth", () => ({ createSupabaseIdentityAuthenticator: driver.createAuthenticator }));
vi.mock("@/lib/supabase/cookie-auth", () => ({ createSupabaseCookieIdentityAuthenticator: driver.createCookieAuthenticator }));

beforeEach(() => {
  vi.clearAllMocks();
  driver.query.mockReset().mockResolvedValue({ rows: [] });
  driver.connect.mockResolvedValue({ query: driver.query, release: driver.release });
  driver.getPool.mockReturnValue({ connect: driver.connect });
  driver.createPoolProvider.mockReturnValue(driver.getPool);
  driver.createAuthenticator.mockReturnValue(async () => "10000000-0000-4000-8000-000000000001");
  driver.createCookieAuthenticator.mockReturnValue(async () => "10000000-0000-4000-8000-000000000001");
  vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:55322/postgres");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
});
afterEach(() => vi.unstubAllEnvs());

test("discovery requires auth configuration and assembles both bearer and cookie verification", async () => {
  const dependencies = createDiscoveryDependencies();
  expect(driver.getPool).not.toHaveBeenCalled();
  expect(await dependencies.discoverSessions.searchPublic()).toEqual([]);
  expect(driver.query.mock.calls).toEqual([
    ["begin isolation level repeatable read"],
    [expect.stringContaining("from sessions"), [expect.any(Date)]],
    ["commit"],
  ]);
  expect(driver.createAuthenticator).toHaveBeenCalledOnce();
  expect(driver.createCookieAuthenticator).toHaveBeenCalledOnce();
  await expect(dependencies.authenticate(new Request("https://app.test/api/sessions"))).resolves.toBe("10000000-0000-4000-8000-000000000001");
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
test("missing database configuration returns unavailable without opening infrastructure", async () => {
  vi.stubEnv("DATABASE_URL", "");
  await expect(createDiscoveryDependencies().discoverSessions.searchPublic()).rejects.toBeInstanceOf(DiscoveryApiUnavailableError);
  expect(driver.createPoolProvider).not.toHaveBeenCalled();
});
test("missing Supabase settings prevents listing without opening infrastructure", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  const dependencies = createDiscoveryDependencies();
  await expect(dependencies.authenticate(new Request("https://app.test/api/sessions"))).rejects.toBeInstanceOf(DiscoveryApiUnavailableError);
  await expect(dependencies.discoverSessions.searchPublic()).rejects.toBeInstanceOf(DiscoveryApiUnavailableError);
  expect(driver.createPoolProvider).not.toHaveBeenCalled();
});

test("invalid database settings fail setup instead of returning unavailable", () => {
  vi.stubEnv("DATABASE_URL", "postgresql://unsafe-remote.example/postgres");
  expect(createDiscoveryDependencies).toThrow();
});
