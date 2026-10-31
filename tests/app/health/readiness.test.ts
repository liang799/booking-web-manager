import { afterEach, beforeEach, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({ createProvider: vi.fn(), getPool: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/database/postgres-pool", () => ({ createPostgresPoolProvider: db.createProvider }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:55322/postgres");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  db.createProvider.mockReturnValue(db.getPool);
  db.getPool.mockReturnValue({ query: db.query });
  db.query.mockResolvedValue({ rows: [] });
});
afterEach(() => vi.unstubAllEnvs());

test.each(["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"])(
  "reports unavailable if %s is missing, without opening a connection",
  async (name) => {
    vi.stubEnv(name, "");
    const { isApiReady } = await import("@/app/health/readiness");
    expect(await isApiReady()).toBe(false);
    expect(db.createProvider).not.toHaveBeenCalled();
  },
);

test("checks actual session-table read access and reuses one pool", async () => {
  const { isApiReady } = await import("@/app/health/readiness");
  expect(await isApiReady()).toBe(true);
  expect(await isApiReady()).toBe(true);
  expect(db.createProvider).toHaveBeenCalledExactlyOnceWith("postgresql://postgres:postgres@127.0.0.1:55322/postgres");
  expect(db.getPool).toHaveBeenCalledTimes(2);
  expect(db.query).toHaveBeenCalledTimes(2);
  expect(db.query).toHaveBeenCalledWith({ text: "select 1 from sessions limit 0", query_timeout: 1500 });
});

test("fails closed during an outage and recovers on the next probe", async () => {
  db.query.mockRejectedValueOnce(new Error("private database connection error"));
  const { isApiReady } = await import("@/app/health/readiness");
  expect(await isApiReady()).toBe(false);
  expect(await isApiReady()).toBe(true);
  expect(db.createProvider).toHaveBeenCalledOnce();
});
