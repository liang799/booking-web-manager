import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createSessionInvitationDependencies } from "@/use-case-config/invitations";
import { createSessionInvitationPreviewDependencies } from "@/use-case-config/invitation-preview";
import { SessionManagementUnavailableError } from "@/app/sessions/session-management-unavailable";
import { GetSessionInvitation } from "@/use-cases/sessions/GetSessionInvitation";
import { GetInvitedSession } from "@/use-cases/sessions/GetInvitedSession";

const driver = vi.hoisted(() => ({ query: vi.fn<(sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>>(), connect: vi.fn(), release: vi.fn(), getPool: vi.fn(), createPoolProvider: vi.fn(), authenticate: vi.fn(), createAuthenticator: vi.fn(), cookieIdentity: vi.fn(), createCookieIdentity: vi.fn() }));
vi.mock("@/lib/database/postgres-pool", () => ({ createPostgresPoolProvider: driver.createPoolProvider }));
vi.mock("@/lib/supabase/bearer-auth", () => ({ createSupabaseIdentityAuthenticator: driver.createAuthenticator }));
vi.mock("@/lib/supabase/cookie-auth", () => ({ createSupabaseCookieIdentityAuthenticator: driver.createCookieIdentity }));

beforeEach(() => {
  vi.resetAllMocks();
  driver.query.mockResolvedValue({ rows: [] });
  driver.connect.mockResolvedValue({ query: driver.query, release: driver.release });
  driver.getPool.mockReturnValue({ connect: driver.connect });
  driver.createPoolProvider.mockReturnValue(driver.getPool);
  driver.createAuthenticator.mockReturnValue(driver.authenticate);
  driver.createCookieIdentity.mockReturnValue(driver.cookieIdentity);
  vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:55322/postgres");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
});
afterEach(() => vi.unstubAllEnvs());

test("assembles lazy owner reads with bearer and login-cookie identities while a bad bearer cannot fall through to cookies", async () => {
  const dependencies = createSessionInvitationDependencies();
  expect(dependencies.invitation).toBeInstanceOf(GetSessionInvitation);
  expect(driver.getPool).not.toHaveBeenCalled();
  driver.authenticate.mockResolvedValue(null);
  driver.cookieIdentity.mockResolvedValue("owner");

  expect(await dependencies.authenticate(new Request("http://localhost/api/sessions/id/invitation", { headers: { authorization: "Bearer invalid" } }))).toBeNull();
  expect(driver.cookieIdentity).not.toHaveBeenCalled();
  expect(await dependencies.authenticate(new Request("http://localhost/api/sessions/id/invitation"))).toBe("owner");
  expect(driver.getPool).not.toHaveBeenCalled();
});

test("public preview needs only database configuration and never constructs authenticators or reads account state", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  const dependencies = createSessionInvitationPreviewDependencies();
  expect(dependencies.preview).toBeInstanceOf(GetInvitedSession);
  expect(driver.getPool).not.toHaveBeenCalled();

  expect(await dependencies.preview.byToken("session", "exact-token")).toBeNull();
  expect(driver.createAuthenticator).not.toHaveBeenCalled();
  expect(driver.createCookieIdentity).not.toHaveBeenCalled();
  expect(driver.query).toHaveBeenCalledWith(expect.stringContaining("where session_id = $1 and room_token = $2"), ["session", "exact-token", expect.any(Date)]);
  expect(driver.query.mock.calls.every(([sql]) => !/wallets|profiles|participations|ledger_entries/.test(sql))).toBe(true);
  expect(driver.query).toHaveBeenLastCalledWith("commit");
  expect(driver.release).toHaveBeenCalledExactlyOnceWith(false);
});

test("missing database settings produce unavailability without an invalid-invitation result or opening infrastructure", async () => {
  vi.stubEnv("DATABASE_URL", "");
  const owner = createSessionInvitationDependencies();
  const preview = createSessionInvitationPreviewDependencies();
  await expect(owner.invitation.forBooker("owner", "session")).rejects.toBeInstanceOf(SessionManagementUnavailableError);
  await expect(preview.preview.byToken("session", "token")).rejects.toBeInstanceOf(SessionManagementUnavailableError);
  expect(driver.createPoolProvider).not.toHaveBeenCalled();
  expect(driver.createAuthenticator).not.toHaveBeenCalled();
});
