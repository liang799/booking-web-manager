import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
import { isProtectedPath, isPublicPath, isSessionInvitationPath } from "@/app/(auth)/redirect-path";
import { isAuthenticationConfigured } from "@/lib/supabase/is-configured";
import { middleware } from "@/middleware";
import { fakeSupabase } from "../../use-cases/support/fake-supabase-auth";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("@/lib/supabase/is-configured", () => ({ isAuthenticationConfigured: vi.fn() }));

const path = "/sessions/11111111-1111-4111-8111-111111111111/join";
const invitation = `${path}?token=private-room-token`;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isAuthenticationConfigured).mockReturnValue(true);
  vi.mocked(createServerClient).mockReturnValue(fakeSupabase({ user: null }) as never);
});

test("only the concrete invitation page is public inside Sessions", () => {
  expect(isSessionInvitationPath(path)).toBe(true);
  expect(isPublicPath(path)).toBe(true);
  expect(isProtectedPath(path)).toBe(false);
  for (const protectedPath of ["/sessions", "/sessions/create", "/sessions/not-a-uuid/join", `${path}/extra`, path.replace("/join", "/participants")]) {
    expect(isSessionInvitationPath(protectedPath)).toBe(false);
    expect(isPublicPath(protectedPath)).toBe(false);
    expect(isProtectedPath(protectedPath)).toBe(true);
  }
});

test.each(["signed-out", "unconfigured", "initialization-failure", "provider-failure", "signed-in"])(
  "invitation preview stays public and private to the browser during %s", async (state) => {
    const from = vi.fn();
    if (state === "unconfigured") vi.mocked(isAuthenticationConfigured).mockReturnValue(false);
    if (state === "initialization-failure") vi.mocked(createServerClient).mockImplementation(() => { throw new Error("private provider error"); });
    if (state === "provider-failure") vi.mocked(createServerClient).mockReturnValue({ auth: { getUser: vi.fn().mockRejectedValue(new Error("provider unavailable")) } } as never);
    if (state === "signed-in") vi.mocked(createServerClient).mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "viewer" } } }) }, from } as never);
    const response = await middleware(new NextRequest(`https://booking.example${invitation}`));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(from).not.toHaveBeenCalled();
    if (state === "unconfigured") expect(createServerClient).not.toHaveBeenCalled();
  },
);

test.each(["/login", "/register"])("signed-in %s returns to the invitation without leaking its referrer", async (authPath) => {
  vi.mocked(createServerClient).mockReturnValue(fakeSupabase({ user: { id: "viewer" } }) as never);
  const response = await middleware(new NextRequest(`https://booking.example${authPath}?${new URLSearchParams({ next: invitation })}`));
  expect(response.headers.get("location")).toBe(`https://booking.example${invitation}`);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});

test("nearby participant management still redirects signed-out users to login", async () => {
  const response = await middleware(new NextRequest(`https://booking.example${path.replace("/join", "/participants")}`));
  expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
});

test("refreshing login cookies preserves invitation response protections", async () => {
  vi.mocked(createServerClient).mockImplementation((_url, _key, options) => {
    if ("setAll" in options.cookies) options.cookies.setAll?.([{ name: "refreshed-session", value: "fresh-cookie", options: { httpOnly: true } }], {});
    return fakeSupabase({ user: null }) as never;
  });
  const response = await middleware(new NextRequest(`https://booking.example${invitation}`));
  expect(response.cookies.get("refreshed-session")?.value).toBe("fresh-cookie");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});

test("a signed-in auth-page request cannot redirect to another site", async () => {
  vi.mocked(createServerClient).mockReturnValue(fakeSupabase({ user: { id: "viewer" } }) as never);
  const response = await middleware(new NextRequest("https://booking.example/login?next=https%3A%2F%2Felsewhere.example"));
  expect(response.headers.get("location")).toBe("https://booking.example/");
});
