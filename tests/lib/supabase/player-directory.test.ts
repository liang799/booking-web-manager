import { describe, expect, test, vi } from "vitest";
import { UserHandle } from "@/domain/accounts/user-handle";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabasePlayerDirectory } from "@/lib/supabase/player-directory";
import { UserDirectoryReadError } from "@/lib/supabase/postgres-user-directory";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

type Call = readonly [method: string, ...args: unknown[]];

/** A stand-in for the admin client whose profile query records its calls and resolves to `result`. */
function adminReturning(result: { readonly data: unknown; readonly error: unknown }) {
  const calls: Call[] = [];
  const builder: object = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "then") return (resolve: (value: unknown) => void) => resolve(result);
        return (...args: unknown[]) => {
          calls.push([String(property), ...args]);
          return builder;
        };
      },
    },
  );
  vi.mocked(createAdminClient).mockReturnValue({ from: (table: string) => (calls.push(["from", table]), builder) } as never);
  return calls;
}

// Owner: Joseph (Jolingoes) — /lib/supabase (ADR-0022)
describe("supabasePlayerDirectory", () => {
  test("finds only the ACTIVE profile holding exactly the user ID", async () => {
    // Arrange
    const calls = adminReturning({ data: { user_id: "u1", handle: "aisha_tan", display_name: " Aisha Tan " }, error: null });

    // Act
    const found = await supabasePlayerDirectory().findActiveByHandle(UserHandle.parse("@Aisha_Tan"));

    // Assert
    expect(found).toEqual({ userId: "u1", handle: "aisha_tan", displayName: "Aisha Tan" });
    expect(calls).toContainEqual(["from", "profiles"]);
    expect(calls).toContainEqual(["eq", "handle", "aisha_tan"]);
    expect(calls).toContainEqual(["eq", "account_status", "ACTIVE"]);
  });

  test("returns null when nobody active holds the user ID", async () => {
    // Arrange
    adminReturning({ data: null, error: null });

    // Act
    const found = await supabasePlayerDirectory().findActiveByHandle(UserHandle.parse("nobody_here"));

    // Assert
    expect(found).toBeNull();
  });

  test("passes on a database error, and reports an unreadable row separately", async () => {
    // Arrange
    adminReturning({ data: null, error: { code: "57014", message: "canceling statement" } });
    const failing = supabasePlayerDirectory().findActiveByHandle(UserHandle.parse("aisha_tan"));
    adminReturning({ data: { user_id: "u1" }, error: null });
    const unreadable = supabasePlayerDirectory().findActiveByHandle(UserHandle.parse("aisha_tan"));

    // Act & Assert
    await expect(failing).rejects.toMatchObject({ code: "57014" });
    await expect(unreadable).rejects.toBeInstanceOf(UserDirectoryReadError);
  });
});
