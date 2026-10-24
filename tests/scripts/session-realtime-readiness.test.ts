import { describe, expect, test, vi } from "vitest";
import { prepareSessionRealtime } from "../../scripts/session-realtime-readiness.mjs";

// Even a guard regression must never make a network request from these tests.
vi.mock("pg", () => ({ Pool: vi.fn(() => { throw new Error("Database opened before validation"); }) }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => { throw new Error("Realtime opened before validation"); }),
}));

const disposableEnvironment = {
  SESSION_TEST_STACK_ID: "bwm-session-tests-safety-test",
  SESSION_TEST_DATABASE_URL: "postgresql://postgres:unused@127.0.0.1:55322/postgres",
  DATABASE_URL: "postgresql://postgres:unused@127.0.0.1:55322/postgres",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "unused",
};

describe("disposable Realtime readiness safety", () => {
  test.each([
    { SESSION_TEST_STACK_ID: "developer-stack" },
    { SESSION_TEST_DATABASE_URL: undefined },
    { NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined },
    { SESSION_TEST_DATABASE_URL: "postgresql://postgres:unused@hosted.example:55322/postgres" },
    { SESSION_TEST_DATABASE_URL: "postgresql://postgres:unused@127.0.0.1:54322/postgres" },
    { SESSION_TEST_DATABASE_URL: "postgresql://postgres:unused@127.0.0.1:55322/other" },
    { SESSION_TEST_DATABASE_URL: "postgresql://postgres:unused@127.0.0.1:55322/postgres?host=hosted.example" },
    { DATABASE_URL: "postgresql://postgres:unused@127.0.0.1:55322/other" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://hosted.example:55321" },
    { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" },
    { NEXT_PUBLIC_SUPABASE_URL: "invalid URL" },
  ])("rejects unsafe or mismatched settings before connecting: %j", async (override) => {
    await expect(prepareSessionRealtime({ ...disposableEnvironment, ...override }))
      .rejects.toThrow("Realtime readiness requires the disposable loopback stack on 55321/55322");
  });
});
