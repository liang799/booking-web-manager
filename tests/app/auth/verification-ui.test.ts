import { createElement, useActionState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { logIn } from "@/app/(auth)/login/actions";
import { LoginForm } from "@/app/(auth)/login/login-form";
import { registerUser } from "@/app/(auth)/register/actions";
import { RegisterForm } from "@/app/(auth)/register/register-form";
import LoginPage from "@/app/(auth)/login/page";
import RegisterPage from "@/app/(auth)/register/page";

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useActionState: vi.fn(),
}));
vi.mock("@/app/(auth)/login/actions", () => ({ logIn: vi.fn() }));
vi.mock("@/app/(auth)/register/actions", () => ({ registerUser: vi.fn() }));
vi.mock("@/app/(auth)/resend-confirmation", () => ({ resendConfirmation: vi.fn() }));

beforeEach(() => vi.resetAllMocks());

describe("pending verification UI", () => {
  const invitation = "/sessions/11111111-1111-4111-8111-111111111111/join?token=room-token";
  test("both auth page switches and forms retain the invitation", async () => {
    vi.mocked(useActionState).mockImplementation(() => [{ status: "idle" }, vi.fn(), false]);
    const login = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ next: invitation }) }));
    const register = renderToStaticMarkup(await RegisterPage({ searchParams: Promise.resolve({ next: invitation }) }));
    expect(login.match(new RegExp(`href="/register\\?next=${encodeURIComponent(invitation)}"`, "g"))).toHaveLength(2);
    expect(register.match(new RegExp(`href="/login\\?next=${encodeURIComponent(invitation)}"`, "g"))).toHaveLength(2);
    for (const html of [login, register]) expect(html).toContain(`name="next" value="${invitation}"`);
  });

  test.each(["check-email", "error"])("registration %s recovery retains next in its login links", (status) => {
    vi.mocked(useActionState).mockImplementation((action) => [
      action === registerUser ? { status, email: "marcus@example.com", emailTaken: true, message: "Already registered" } : { status: "idle" },
      vi.fn(), false,
    ]);
    const html = renderToStaticMarkup(createElement(RegisterForm, { next: invitation }));
    expect(html).toContain(`href="/login?next=${encodeURIComponent(invitation)}"`);
    expect(html).toContain(`name="next" value="${invitation}"`);
  });

  test("invalid auth continuations are removed from links and hidden fields", async () => {
    vi.mocked(useActionState).mockImplementation(() => [{ status: "idle" }, vi.fn(), false]);
    const html = renderToStaticMarkup(await RegisterPage({ searchParams: Promise.resolve({ next: "https://elsewhere.example" }) }));
    expect(html).not.toContain("elsewhere.example");
    expect(html).toContain('name="next" value="/"');
    expect(html).toContain('href="/login"');
  });
  test("replaces the completed registration form with email recovery and a login path", () => {
    vi.mocked(useActionState).mockImplementation((action) => [
      action === registerUser ? { status: "check-email", email: "marcus@example.com" } : { status: "idle" },
      vi.fn(), false,
    ]);

    const html = renderToStaticMarkup(createElement(RegisterForm));

    expect(html).toContain("marcus@example.com");
    expect(html).toContain("You are not logged in yet");
    expect(html).toContain("Resend confirmation email");
    expect(html).toContain('href="/login"');
    expect(html).not.toContain('name="password"');
  });

  test("gives an unverified login a separate resend form while retaining the login destination", () => {
    vi.mocked(useActionState).mockImplementation((action) => [
      action === logIn ? { status: "check-email", email: "marcus@example.com" } : { status: "idle" },
      vi.fn(), false,
    ]);

    const html = renderToStaticMarkup(createElement(LoginForm, { next: "/profile" }));

    expect(html).toContain("Resend confirmation email");
    expect(html).toContain('name="next" value="/profile"');
    expect(html).toContain('name="password"');
    expect(html.match(/<form\b/g)).toHaveLength(2);
    expect(html.indexOf("</form>")).toBeLessThan(html.lastIndexOf("<form"));
  });
});
