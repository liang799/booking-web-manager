import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ReliabilityScore } from "@/domain";
import { loadReliabilityScore } from "@/app/profile/reliability";
import { ReliabilityUnavailableError } from "@/app/profile/reliability-dependencies";
import { getReliabilityDependencies } from "@/app/profile/reliability-server-dependencies";

vi.mock("@/app/profile/reliability-server-dependencies", () => ({ getReliabilityDependencies: vi.fn() }));

/** Dependencies whose use case answers with `outcome` (a score, or a thrown error). */
function dependencies(outcome: number | Error) {
  const forUser = vi.fn(async () => {
    if (outcome instanceof Error) throw outcome;
    return ReliabilityScore.from(outcome);
  });
  vi.mocked(getReliabilityDependencies).mockResolvedValue({ reliabilityScore: { forUser } });
  return forUser;
}

describe("loadReliabilityScore", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  test("returns the user's score on the 0-100 scale", async () => {
    // Arrange
    const forUser = dependencies(66.5);

    // Act
    const score = await loadReliabilityScore("user-score");

    // Assert
    expect(score).toBe(66.5);
    expect(forUser).toHaveBeenCalledExactlyOnceWith("user-score");
  });

  test("returns null, without logging, when the server has no database settings", async () => {
    // Arrange
    dependencies(new ReliabilityUnavailableError());

    // Act
    const score = await loadReliabilityScore("user-unconfigured");

    // Assert
    expect(score).toBeNull();
    expect(console.error).not.toHaveBeenCalled();
  });

  test("returns null and logs only the error name when the read fails", async () => {
    // Arrange
    dependencies(Object.assign(new Error("password=secret"), { name: "SessionPersistenceError" }));

    // Act
    const score = await loadReliabilityScore("user-failure");

    // Assert
    expect(score).toBeNull();
    expect(console.error).toHaveBeenCalledExactlyOnceWith("UC1-03 reliability score read failed:", "SessionPersistenceError");
  });

  test("returns null when the dependencies cannot be created", async () => {
    // Arrange
    vi.mocked(getReliabilityDependencies).mockRejectedValue(new TypeError("invalid DATABASE_URL"));

    // Act
    const score = await loadReliabilityScore("user-setup");

    // Assert
    expect(score).toBeNull();
    expect(console.error).toHaveBeenCalledExactlyOnceWith("UC1-03 reliability score read failed:", "TypeError");
  });
});
