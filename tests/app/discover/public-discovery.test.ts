import { beforeEach, describe, expect, test, vi } from "vitest";

const configuration = vi.hoisted(() => ({ createDiscoveryDependencies: vi.fn() }));
vi.mock("@/use-case-config/discovery", () => configuration);
const userId = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.resetModules();
  configuration.createDiscoveryDependencies.mockReset();
});

async function scenario(authenticate: (request: Request) => Promise<string | null>) {
  const searchPublic = vi.fn().mockResolvedValue([]);
  configuration.createDiscoveryDependencies.mockReturnValue({
    authenticate, discoverSessions: { searchPublic },
  });
  const { GET } = await import("@/app/api/sessions/route");
  return { GET, searchPublic };
}

describe("authenticated session discovery", () => {
  test.each([undefined, "Bearer expired"])("rejects missing or expired credentials: %s", async (authorization) => {
    const authenticate = vi.fn().mockResolvedValue(null);
    const { GET, searchPublic } = await scenario(authenticate);
    const request = new Request("https://example.test/api/sessions?q=Badminton", {
      headers: authorization ? { authorization } : {},
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: "Authentication is required" } });
    expect(authenticate).toHaveBeenCalledExactlyOnceWith(request);
    expect(searchPublic).not.toHaveBeenCalled();
  });

  test("allows a verified active user to discover public sessions", async () => {
    const authenticate = vi.fn().mockResolvedValue(userId);
    const { GET, searchPublic } = await scenario(authenticate);
    const response = await GET(new Request("https://example.test/api/sessions?q=Badminton"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
    expect(searchPublic).toHaveBeenCalledExactlyOnceWith({ text: "Badminton" }, userId);
  });

  test.each([
    ["INACTIVE_ACCOUNT", 403, "An inactive account cannot use the session API"],
    ["NOT_FOUND", 404, "User was not found"],
  ] as const)("denies %s before searching sessions", async (code, status, message) => {
    const { DomainError } = await import("@/domain");
    const authenticate = vi.fn().mockRejectedValue(new DomainError(code, message));
    const { GET, searchPublic } = await scenario(authenticate);

    const response = await GET(new Request("https://example.test/api/sessions"));

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: { code, message } });
    expect(searchPublic).not.toHaveBeenCalled();
  });

  test("fails closed on identity provider errors, without querying session data", async () => {
    const authenticate = vi.fn().mockRejectedValue(new Error("provider connection failed"));
    const { GET, searchPublic } = await scenario(authenticate);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await GET(new Request("https://example.test/api/sessions"));
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ error: { code: "INTERNAL_ERROR", stage: "authentication" } });
      expect(searchPublic).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
