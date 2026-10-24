import { beforeEach, describe, expect, test, vi } from "vitest";

const configuration = vi.hoisted(() => ({ createDiscoveryDependencies: vi.fn() }));
vi.mock("@/use-case-config/discovery", () => configuration);

const userId = "10000000-0000-4000-8000-000000000001";

describe("authenticated session discovery", () => {
  beforeEach(() => {
    vi.resetModules();
    configuration.createDiscoveryDependencies.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  test.each([undefined, "Bearer expired"])("rejects requests without a verified identity: %s", async (authorization) => {
    const authenticate = vi.fn().mockResolvedValue(null);
    const searchPublic = vi.fn().mockResolvedValue([]);
    configuration.createDiscoveryDependencies.mockReturnValue({ authenticate, discoverSessions: { searchPublic } });
    const { GET } = await import("@/app/api/sessions/route");
    const request = new Request("https://example.test/api/sessions?q=Badminton", {
      headers: authorization ? { authorization } : {},
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-server-time")).toBeNull();
    expect(await response.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: "Authentication is required" } });
    expect(authenticate).toHaveBeenCalledExactlyOnceWith(request);
    expect(searchPublic).not.toHaveBeenCalled();
  });

  test.each([undefined, "Bearer valid"])("allows a verified session to browse with %s", async (authorization) => {
    const authenticate = vi.fn().mockResolvedValue(userId);
    const searchPublic = vi.fn().mockResolvedValue([]);
    configuration.createDiscoveryDependencies.mockReturnValue({ authenticate, discoverSessions: { searchPublic } });
    const { GET } = await import("@/app/api/sessions/route");
    const request = new Request("https://example.test/api/sessions?q=Badminton", {
      headers: authorization ? { authorization } : {},
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
    expect(authenticate).toHaveBeenCalledExactlyOnceWith(request);
    expect(searchPublic).toHaveBeenCalledExactlyOnceWith({ text: "Badminton" });
  });

  test("fails closed when authentication fails, before parsing or querying sessions", async () => {
    const authenticate = vi.fn().mockRejectedValue(new Error("private provider failure"));
    const searchPublic = vi.fn().mockResolvedValue([]);
    configuration.createDiscoveryDependencies.mockReturnValue({ authenticate, discoverSessions: { searchPublic } });
    const { GET } = await import("@/app/api/sessions/route");

    const response = await GET(new Request("https://example.test/api/sessions?cursor=bad"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatchObject({ code: "INTERNAL_ERROR", stage: "authentication" });
    expect(JSON.stringify(body)).not.toContain("private provider failure");
    expect(searchPublic).not.toHaveBeenCalled();
  });
});
