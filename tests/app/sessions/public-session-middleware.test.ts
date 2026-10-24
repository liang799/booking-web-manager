import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createServerClient } from "@supabase/ssr";
import { middleware } from "@/middleware";
import { isAuthenticationConfigured } from "@/lib/supabase/is-configured";
import { activeProfile, fakeSupabase } from "../../use-cases/support/fake-supabase-auth";

vi.mock("@/lib/supabase/is-configured", () => ({ isAuthenticationConfigured: vi.fn() }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => {
    throw new Error("Public session endpoints must not initialize Supabase");
  }),
}));

describe("public resources and protected discovery through middleware", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isAuthenticationConfigured).mockReturnValue(true);
  });

  test.each([
    "/api/sessions", "/api/openapi", "/api-docs", "/storybook", "/storybook/index.html?path=/story/discovery--populated",
    "/storybook/iframe.html", "/storybook/index.json", "/storybook/assets/manager.js", "/storybook/assets/style.css", "/fonts/inter-v20-latin.woff2",
  ])(
    "lets %s handle its request without contacting authentication",
    async (path) => {
      // Arrange
      const request = new NextRequest(`http://localhost${path}`);

      // Act
      const response = await middleware(request);

      // Assert
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(createServerClient).not.toHaveBeenCalled();
    },
  );

  test.each(["/groups", "/profile", "/storybook-private", "/storybooks", "/fonts-private/inter.woff2"])(
    "still checks authentication for protected page %s",
    async (path) => {
      // Arrange
      const request = new NextRequest(`http://localhost${path}`);

      // Act & Assert
      await expect(middleware(request)).rejects.toThrow(
        "Public session endpoints must not initialize Supabase",
      );
      expect(createServerClient).toHaveBeenCalledOnce();
    },
  );

  test("serves the anonymous root without configured authentication", async () => {
    vi.mocked(isAuthenticationConfigured).mockReturnValue(false);
    const response = await middleware(new NextRequest("http://localhost/?sport=Tennis"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  test("checks configured root identity so Home can be rendered for an active account", async () => {
    await expect(middleware(new NextRequest("http://localhost/"))).rejects.toThrow("Public session endpoints must not initialize Supabase");
    expect(createServerClient).toHaveBeenCalledOnce();
  });

  test("redirects discovery to login without configured authentication", async () => {
    vi.mocked(isAuthenticationConfigured).mockReturnValue(false);
    const response = await middleware(new NextRequest("http://localhost/discover?sport=Tennis"));
    const destination = new URL(response.headers.get("location")!);
    expect(destination.pathname).toBe("/login");
    expect(destination.searchParams.get("next")).toBe("/discover?sport=Tennis");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  test("fails closed if configured authentication cannot initialize", async () => {
    await expect(middleware(new NextRequest("http://localhost/discover"))).rejects.toThrow(
      "Public session endpoints must not initialize Supabase",
    );
    expect(createServerClient).toHaveBeenCalledOnce();
  });

  test("fails closed if the authentication provider is unavailable", async () => {
    const getUser = vi.fn().mockRejectedValue(new Error("private provider detail"));
    vi.mocked(createServerClient).mockReturnValue({ auth: { getUser } } as never);
    await expect(middleware(new NextRequest("http://localhost/discover?sport=Tennis"))).rejects.toThrow("private provider detail");
    expect(getUser).toHaveBeenCalledOnce();
  });

  test("permits an active account without a verified email after checking the profile", async () => {
    const supabase = fakeSupabase({
      user: { id: "viewer" },
      profile: activeProfile,
    });
    vi.mocked(createServerClient).mockReturnValue(supabase as never);
    const response = await middleware(new NextRequest("http://localhost/discover"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(supabase.profileEq).toHaveBeenCalledWith("user_id", "viewer");
  });
});
