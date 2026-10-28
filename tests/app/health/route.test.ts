import { beforeEach, expect, test, vi } from "vitest";
import { GET } from "@/app/api/health/route";

const readiness = vi.hoisted(() => ({ isApiReady: vi.fn<() => Promise<boolean>>() }));
vi.mock("@/app/health/readiness", () => readiness);

beforeEach(() => readiness.isApiReady.mockReset());

test.each([
  [true, 200, "ok"],
  [false, 503, "unavailable"],
] as const)("health status %s returns HTTP %s without leaking internals", async (ready, status, value) => {
  readiness.isApiReady.mockResolvedValue(ready);
  const response = await GET();
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(await response.json()).toEqual({ status: value });
});
