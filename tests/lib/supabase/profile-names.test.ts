import { beforeEach, describe, expect, test, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { memberProfiles } from "@/lib/supabase/profile-names";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

/** A stand-in admin client whose profiles query answers with `result`, recording the query. */
function profilesAnswer(result: { data: unknown; error: unknown }) {
  const calls: unknown[][] = [];
  const query = {
    select: (...args: unknown[]) => { calls.push(["select", ...args]); return query; },
    in: async (...args: unknown[]) => { calls.push(["in", ...args]); return result; },
  };
  vi.mocked(createAdminClient).mockReturnValue({ from: (table: string) => { calls.push(["from", table]); return query; } } as never);
  return calls;
}

// Owner: Joseph (Jolingoes) — /lib/supabase (UC1-06, ADR-0021)
describe("memberProfiles", () => {
  beforeEach(() => {
    vi.mocked(createAdminClient).mockReset();
  });

  test("returns each member's trimmed name and user ID", async () => {
    // Arrange
    const calls = profilesAnswer({ data: [{ user_id: "u1", display_name: " Marcus Lim ", account_status: "ACTIVE", handle: "marcus_lim" }], error: null });

    // Act
    const profiles = await memberProfiles(["u1"]);

    // Assert
    expect(profiles.get("u1")).toEqual({ name: "Marcus Lim", handle: "marcus_lim" });
    expect(calls).toEqual([["from", "profiles"], ["select", "user_id, display_name, account_status, handle"], ["in", "user_id", ["u1"]]]);
  });

  test("shows a deleted account as Deleted user without a user ID", async () => {
    // Arrange
    profilesAnswer({ data: [{ user_id: "u2", display_name: "", account_status: "INACTIVE", handle: null }], error: null });

    // Act
    const profiles = await memberProfiles(["u2"]);

    // Assert
    expect(profiles.get("u2")).toEqual({ name: "Deleted user", handle: null });
  });

  test("shows a blank name as Unnamed player", async () => {
    // Arrange
    profilesAnswer({ data: [{ user_id: "u3", display_name: "  ", account_status: "ACTIVE", handle: "player_1234" }], error: null });

    // Act
    const profiles = await memberProfiles(["u3"]);

    // Assert
    expect(profiles.get("u3")).toEqual({ name: "Unnamed player", handle: "player_1234" });
  });

  test("does not query for an empty member list", async () => {
    // Act
    const profiles = await memberProfiles([]);

    // Assert
    expect(profiles.size).toBe(0);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  test("keeps a database failure as an error", async () => {
    // Arrange
    const failure = { code: "08006", message: "connection failure" };
    profilesAnswer({ data: null, error: failure });

    // Act & Assert
    await expect(memberProfiles(["u1"])).rejects.toBe(failure);
  });
});
