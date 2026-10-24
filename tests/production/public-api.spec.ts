import SwaggerParser from "@apidevtools/swagger-parser";
import { expect, test } from "@playwright/test";
import { z } from "zod";

const discoveryPageSchema = z.object({
  items: z.array(
    z.object({
      sessionId: z.string().uuid(),
      venueName: z.string(),
      region: z.string(),
      sport: z.string(),
      startAt: z.string().datetime(),
      endAt: z.string().datetime(),
      totalSlots: z.number().int().min(1).max(30),
      bookingShareCents: z.number().int().positive().safe(),
    }).strict(),
  ).max(20),
  nextCursor: z.string().nullable(),
}).strict();

test("production serves its OpenAPI contract", async ({ request }) => {
  const response = await request.get("/api/openapi");
  expect(response.status()).toBe(200);

  const document = await response.json();
  await expect(SwaggerParser.validate(structuredClone(document))).resolves.toBeDefined();
  expect(document.openapi).toMatch(/^3\./);
  expect(document.paths?.["/api/sessions"]?.get).toBeDefined();
});

test("live GET /api/sessions matches the authentication contract of its deployed version", async ({ request }) => {
  // Production may still run the prior deployment while this PR is in review.
  // Read the *deployed* OpenAPI contract rather than assuming the PR has shipped.
  const specification = await request.get("/api/openapi");
  expect(specification.status()).toBe(200);
  const document = await specification.json();
  const security = document.paths?.["/api/sessions"]?.get?.security;
  expect(Array.isArray(security)).toBe(true);
  const requiresAuthentication = security.length > 0;

  const anonymous = await request.get("/api/sessions");
  expect(anonymous.status()).toBe(requiresAuthentication ? 401 : 200);
  expect(anonymous.headers()["cache-control"]).toBe("no-store");
  if (requiresAuthentication) {
    expect(await anonymous.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: "Authentication is required" } });
  } else {
    const parsed = discoveryPageSchema.safeParse(await anonymous.json());
    expect(parsed.success, parsed.success ? undefined : parsed.error.message).toBe(true);
  }

  // The optional bearer token permits a live authenticated health check.
  const token = process.env.PRODUCTION_TEST_BEARER_TOKEN;
  if (!token) return;
  const response = await request.get("/api/sessions", { headers: { Authorization: `Bearer ${token}` } });
  expect(response.status(), "Authenticated discovery must be healthy; 503 is a production failure").toBe(200);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(response.headers()["cache-control"]).toBe("no-store");
  const parsed = discoveryPageSchema.safeParse(await response.json());
  expect(parsed.success, parsed.success ? undefined : parsed.error.message).toBe(true);
});
