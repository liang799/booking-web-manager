import { describe, expect, test, vi } from "vitest";
import { DomainError } from "@/domain";
import { PayoutsUnavailableError, type PayoutDependencies } from "@/app/payouts/payout-dependencies";
import { PayoutProviderError } from "@/use-cases/payouts/SetUpPayoutAccount";

const mocks = vi.hoisted(() => ({ dependencies: vi.fn() }));
vi.mock("@/app/payouts/payout-server-dependencies", () => ({
  getPayoutDependencies: mocks.dependencies,
}));

import { GET, POST } from "@/app/api/payouts/account/route";

const userId = "11111111-1111-4111-8111-111111111111";

describe("UC1-07 payout account routes", () => {
  test("GET returns the signed-in user's setup without caching", async () => {
    // Arrange
    const status = vi.fn(async () => ({ status: "COMPLETE" as const, instantPayoutsAvailable: true }));
    mocks.dependencies.mockResolvedValue(dependencies({ status }));

    // Act
    const response = await GET(new Request("https://app.test/api/payouts/account"));

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "COMPLETE", instantPayoutsAvailable: true });
    expect(status).toHaveBeenCalledWith(userId);
  });

  test("POST sends Stripe back to this site's payouts page", async () => {
    // Arrange
    const start = vi.fn(async () => ({ status: "PENDING" as const, onboardingUrl: "https://connect.stripe.test/x" }));
    mocks.dependencies.mockResolvedValue(dependencies({ start }));

    // Act
    const response = await POST(new Request("https://app.test/api/payouts/account", { method: "POST" }));

    // Assert
    expect(response.status).toBe(200);
    expect(start).toHaveBeenCalledWith(userId, {
      returnUrl: "https://app.test/payouts?onboarding=return",
      refreshUrl: "https://app.test/payouts?onboarding=refresh",
    });
  });

  test("answers 401 for a signed-out request", async () => {
    // Arrange
    mocks.dependencies.mockResolvedValue(dependencies({}, async () => null));

    // Act
    const response = await GET(new Request("https://app.test/api/payouts/account"));

    // Assert
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("answers 503 when payouts are not configured", async () => {
    // Arrange
    mocks.dependencies.mockResolvedValue(
      dependencies({}, async () => {
        throw new PayoutsUnavailableError();
      }),
    );

    // Act
    const response = await GET(new Request("https://app.test/api/payouts/account"));

    // Assert
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("PAYOUTS_UNAVAILABLE");
  });

  test("answers 502 when Stripe cannot be reached", async () => {
    // Arrange
    const start = vi.fn(async () => {
      throw new PayoutProviderError("unreachable");
    });
    mocks.dependencies.mockResolvedValue(dependencies({ start }));

    // Act
    const response = await POST(new Request("https://app.test/api/payouts/account", { method: "POST" }));

    // Assert
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("PAYOUT_PROVIDER_UNAVAILABLE");
  });

  test("answers 403 for an inactive account", async () => {
    // Arrange
    const start = vi.fn(async () => {
      throw new DomainError("INACTIVE_ACCOUNT", "An inactive account cannot set up payouts");
    });
    mocks.dependencies.mockResolvedValue(dependencies({ start }));

    // Act
    const response = await POST(new Request("https://app.test/api/payouts/account", { method: "POST" }));

    // Assert
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("INACTIVE_ACCOUNT");
  });

  test("keeps unexpected failures opaque", async () => {
    // Arrange
    const status = vi.fn(async () => {
      throw new Error("connection string leaked here");
    });
    mocks.dependencies.mockResolvedValue(dependencies({ status }));

    // Act
    const response = await GET(new Request("https://app.test/api/payouts/account"));

    // Assert
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  });
});

function dependencies(
  payoutSetup: Partial<PayoutDependencies["payoutSetup"]>,
  authenticate: PayoutDependencies["authenticate"] = async () => userId,
): PayoutDependencies {
  const unused = async (): Promise<never> => {
    throw new Error("not used in this test");
  };
  return { authenticate, payoutSetup: { status: unused, start: unused, ...payoutSetup } };
}
