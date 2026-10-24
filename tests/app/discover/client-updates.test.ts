import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { subscribeToDiscoveryChanges } from "@/app/discover/client-updates";
import { subscribeToDiscoveryInvalidation } from "@/lib/sessions/supabase-discovery-subscription";

vi.mock("@/lib/sessions/supabase-discovery-subscription", () => ({ subscribeToDiscoveryInvalidation: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""); });
afterEach(() => vi.unstubAllEnvs());

test("database-only discovery needs no browser auth or Realtime settings", () => {
  const stop = subscribeToDiscoveryChanges(vi.fn());
  expect(subscribeToDiscoveryInvalidation).not.toHaveBeenCalled();
  expect(stop).not.toThrow();
});

test("valid settings are passed to infrastructure and its cleanup is retained", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", " https://example.supabase.co ");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", " public-key ");
  const invalidate = vi.fn(); const stop = vi.fn();
  vi.mocked(subscribeToDiscoveryInvalidation).mockReturnValue(stop);
  expect(subscribeToDiscoveryChanges(invalidate)).toBe(stop);
  expect(subscribeToDiscoveryInvalidation).toHaveBeenCalledWith({ url: "https://example.supabase.co", key: "public-key" }, invalidate);
});

test.each(["not-a-url", "file:///tmp/socket"])("invalid settings %s leave reconciliation available", (url) => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-key");
  expect(subscribeToDiscoveryChanges(vi.fn())).not.toThrow();
  expect(subscribeToDiscoveryInvalidation).not.toHaveBeenCalled();
});

test("provider initialization failure cannot break the public screen", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-key");
  vi.mocked(subscribeToDiscoveryInvalidation).mockImplementation(() => { throw new Error("Unavailable"); });
  expect(subscribeToDiscoveryChanges(vi.fn())).not.toThrow();
});
