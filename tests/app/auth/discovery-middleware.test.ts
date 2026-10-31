import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
import { isProtectedPath, isPublicPath } from "@/app/(auth)/redirect-path";
import { getAccountStatus } from "@/lib/supabase/account-status";
import { isAuthenticationConfigured } from "@/lib/supabase/is-configured";
import { middleware } from "@/middleware";
import { fakeSupabase } from "../../use-cases/support/fake-supabase-auth";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("@/lib/supabase/is-configured", () => ({ isAuthenticationConfigured: vi.fn() }));
vi.mock("@/lib/supabase/account-status", () => ({ getAccountStatus: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isAuthenticationConfigured).mockReturnValue(true);
  vi.mocked(createServerClient).mockReturnValue(fakeSupabase({ user: null }) as never);
  vi.mocked(getAccountStatus).mockResolvedValue({ kind: "active" });
});

test("Discover is protected while registration and login remain public", () => {
  expect(isProtectedPath("/discover")).toBe(true);
  expect(isPublicPath("/discover")).toBe(false);
  for (const path of ["/", "/login", "/register", "/terms", "/privacy"]) {
    expect(isPublicPath(path)).toBe(true);
  }
});

test("signed-out discovery redirects to login and preserves filters", async () => {
  const response = await middleware(new NextRequest("https://booking.example/discover?sport=Tennis&q=Jurong"));
  const target = new URL(response.headers.get("location")!);
  expect(target.pathname).toBe("/login");
  expect(target.searchParams.get("next")).toBe("/discover?sport=Tennis&q=Jurong");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(getAccountStatus).not.toHaveBeenCalled();
});

test("active accounts can browse discovery", async () => {
  vi.mocked(createServerClient).mockReturnValue(fakeSupabase({ user: { id: "viewer" } }) as never);
  const response = await middleware(new NextRequest("https://booking.example/discover"));
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expect(getAccountStatus).toHaveBeenCalledOnce();
});

test.each([
  { kind: "inactive" },
  { kind: "missing-profile" },
  { kind: "lookup-failed", code: "DATABASE_UNAVAILABLE", message: "Profile read unavailable" },
] as const)("account check failure ($kind) preserves discovery filters", async (status) => {
  vi.mocked(createServerClient).mockReturnValue(fakeSupabase({ user: { id: "viewer" } }) as never);
  vi.mocked(getAccountStatus).mockResolvedValue(status);
  const response = await middleware(new NextRequest("https://booking.example/discover?sport=Tennis&q=Jurong"));
  const target = new URL(response.headers.get("location")!);
  expect(target.pathname).toBe("/login");
  expect(target.searchParams.get("next")).toBe("/discover?sport=Tennis&q=Jurong");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

test("account check failures retain the existing next destination for non-discovery pages", async () => {
  vi.mocked(createServerClient).mockReturnValue(fakeSupabase({ user: { id: "viewer" } }) as never);
  vi.mocked(getAccountStatus).mockResolvedValue({ kind: "inactive" });
  const response = await middleware(new NextRequest("https://booking.example/profile?next=%2Fwallet"));
  const target = new URL(response.headers.get("location")!);
  expect(target.pathname).toBe("/login");
  expect(target.searchParams.get("next")).toBe("/wallet");
});

test("unconfigured authentication redirects discovery but keeps registration public", async () => {
  vi.mocked(isAuthenticationConfigured).mockReturnValue(false);
  const locked = await middleware(new NextRequest("https://booking.example/discover?sport=Badminton"));
  const target = new URL(locked.headers.get("location")!);
  expect(target.pathname).toBe("/login");
  expect(target.searchParams.get("next")).toBe("/discover?sport=Badminton");
  const registration = await middleware(new NextRequest("https://booking.example/register"));
  expect(registration.headers.get("location")).toBeNull();
  expect(createServerClient).not.toHaveBeenCalled();
});
