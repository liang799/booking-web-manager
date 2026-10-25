import SwaggerParser from "@apidevtools/swagger-parser";
import { expect, test } from "@playwright/test";

test("production serves its OpenAPI contract", async ({ request }) => {
  const response = await request.get("/api/openapi");
  expect(response.status()).toBe(200);

  const document = await response.json();
  await expect(SwaggerParser.validate(structuredClone(document))).resolves.toBeDefined();
  expect(document.openapi).toMatch(/^3\./);
  expect(document.paths?.["/api/sessions"]?.get).toBeDefined();
  expect(document.paths?.["/api/health"]?.get).toMatchObject({ security: [], responses: expect.objectContaining({ 200: expect.any(Object), 503: expect.any(Object) }) });
  expect(document.paths["/api/sessions"].get.security).toEqual([{ bearerAuth: [] }, { loginCookie: [] }]);
});

test("live GET /api/health checks database readiness without authentication", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status(), "Deployment is not ready to serve session queries").toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({ status: "ok" });
});

test("live GET /api/sessions rejects anonymous visitors", async ({ request }) => {
  const response = await request.get("/api/sessions");

  expect(response.status()).toBe(401);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({
    error: { code: "UNAUTHENTICATED", message: "Authentication is required" },
  });
});
