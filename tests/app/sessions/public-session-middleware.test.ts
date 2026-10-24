import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createServerClient } from "@supabase/ssr";
import { middleware } from "@/middleware";
import { getAccountStatus } from "@/lib/supabase/account-status";
import { isAuthenticationConfigured } from "@/lib/supabase/is-configured";

vi.mock("@/lib/supabase/is-configured", () => ({ isAuthenticationConfigured: vi.fn() }));
vi.mock("@/lib/supabase/account-status", () => ({ getAccountStatus: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));

describe("session discovery requires authentication", () => {
  const getUser = vi.fn();
  const signOut = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isAuthenticationConfigured).mockReturnValue(true);
    getUser.mockResolvedValue({ data: { user: null } });
    vi.mocked(createServerClient).mockReturnValue({ auth: { getUser, signOut } } as never);
    vi.mocked(getAccountStatus).mockResolvedValue({ kind: "active" });
  });

  test.each([
    "/api/sessions", "/api/openapi", "/api-docs", "/storybook", "/storybook/index.html?path=/story/discovery--populated",
    "/storybook/iframe.html", "/storybook/index.json", "/storybook/assets/manager.js", "/storybook/assets/style.css",
    "/fonts/inter-v20-latin.woff2",
  ])("lets %s handle its own request without middleware authentication", async (path) => {
    const response = await middleware(new NextRequest(`http://localhost${path}`));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  test("redirects signed-out discovery visitors to login, preserving their query", async () => {
    const response = await middleware(new NextRequest("http://localhost/discover?sport=Tennis&region=West"));
    const destination = new URL(response.headers.get("location")!);
    expect(destination.pathname).toBe("/login");
    expect(destination.searchParams.get("next")).toBe("/discover?sport=Tennis&region=West");
    expect(getUser).toHaveBeenCalledOnce();
    expect(getAccountStatus).not.toHaveBeenCalled();
  });

  test("fails closed for discovery when authentication is not configured", async () => {
    vi.mocked(isAuthenticationConfigured).mockReturnValue(false);
    const response = await middleware(new NextRequest("http://localhost/discover?sport=Tennis"));
    expect(new URL(response.headers.get("location")!).searchParams.get("next")).toBe("/discover?sport=Tennis");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  test("serves the anonymous landing and auth forms without configuration", async () => {
    vi.mocked(isAuthenticationConfigured).mockReturnValue(false);
    for (const path of ["/", "/register", "/login"]) {
      const response = await middleware(new NextRequest(`http://localhost${path}`));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
    expect(createServerClient).not.toHaveBeenCalled();
  });

  test("does not allow discovery to bypass a failing authentication provider", async () => {
    getUser.mockRejectedValueOnce(new Error("auth unavailable"));
    await expect(middleware(new NextRequest("http://localhost/discover"))).rejects.toThrow("auth unavailable");
  });

  test("only active logged-in users can reach discovery", async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: "10000000-0000-4000-8000-000000000001" } } });
    const response = await middleware(new NextRequest("http://localhost/discover"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(getAccountStatus).toHaveBeenCalledOnce();
  });

  test("signs out inactive accounts rather than rendering discovery", async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: "10000000-0000-4000-8000-000000000001" } } });
    vi.mocked(getAccountStatus).mockResolvedValueOnce({ kind: "inactive" });
    const response = await middleware(new NextRequest("http://localhost/discover"));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
    expect(signOut).toHaveBeenCalledOnce();
  });
});
