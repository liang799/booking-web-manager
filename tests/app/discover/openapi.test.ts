import { createOpenApiDocument } from "@/app/openapi/document";
import { registerDiscoveryApi } from "@/app/discover/openapi";
import { parseDiscoveryQuery } from "@/app/discover/query";
import { describe, expect, test } from "vitest";

const discoveryOpenApiDocument = createOpenApiDocument([registerDiscoveryApi]);

describe("session discovery OpenAPI contract", () => {
  test("documents discovery filters, public listing fields, pagination and failures", () => {
    const operation = discoveryOpenApiDocument.paths["/api/sessions"]?.get;
    expect(operation?.security).toEqual([]);
    expect(operation?.parameters?.map((parameter) => "name" in parameter ? parameter.name : undefined)).toEqual([
      "q", "sport", "region", "date", "timeFrom", "timeTo", "cursor",
    ]);
    expect(Object.keys(operation?.responses ?? {})).toEqual([
      "200", "400", "500", "503",
    ]);
    expect(operation?.description).toContain("Asia/Singapore");
    expect(operation?.description).toContain("and full sessions");
    expect(operation?.description).toContain("OneMap resolution is separate work");
    expect(operation?.description).toContain("case-insensitive literal substring");
    expect(operation?.responses["200"]).toMatchObject({
      headers: {
        "Cache-Control": { schema: { type: "string", enum: ["no-store"] } },
        "X-Server-Time": { schema: { type: "string", pattern: "^[0-9]+$" } },
      },
    });
    const query = operation?.parameters?.find((parameter) => "name" in parameter && parameter.name === "q");
    expect(query).toMatchObject({ in: "query", required: false, schema: { type: "string", maxLength: 100, example: "Jurong" } });
    expect(parseDiscoveryQuery(new URLSearchParams({ q: "Jurong", sport: "Badminton", region: "West" }))).toMatchObject({
      status: "valid", criteria: { text: "Jurong", sport: "Badminton", region: "West" },
    });
    expect(operation?.responses["503"]).toMatchObject({
      content: {
        "application/json": {
          example: { error: { code: "DISCOVERY_API_UNAVAILABLE", message: "Session discovery is not available yet" } },
        },
      },
    });
    expect(discoveryOpenApiDocument.components?.schemas?.DiscoverSessionsResult).toMatchObject({
      properties: {
        items: {
          type: "array",
          maxItems: 20,
          items: {
            properties: {
              sessionId: { type: "string", format: "uuid" },
              startAt: { type: "string", format: "date-time" },
              bookingShareCents: { type: "integer" },
            },
          },
        },
        nextCursor: { type: "string", nullable: true },
      },
    });
    const result = JSON.stringify(discoveryOpenApiDocument.components?.schemas?.DiscoverSessionsResult);
    for (const sensitiveField of ["roomToken", "bookerId", "walletId", "holdingAccountId", "invitedGroupId", "participations"]) {
      expect(result).not.toContain(sensitiveField);
    }
  });

  test("documents diagnostic 500 responses without changing ordinary error contracts", () => {
    const operation = discoveryOpenApiDocument.paths["/api/sessions"]?.get;
    expect(operation?.responses["500"]).toMatchObject({
      headers: {
        "Cache-Control": { schema: { type: "string", enum: ["no-store"] } },
        "X-Request-Id": { schema: { type: "string", format: "uuid" } },
      },
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/DiscoveryInternalError" },
          example: {
            error: {
              code: "INTERNAL_ERROR",
              message: "The sessions database schema does not match this deployment. Check that database migrations have been applied.",
              requestId: "b6b6b6b6-1234-4123-8123-123456789abc",
              reason: "DATABASE_SCHEMA_MISMATCH",
              stage: "query",
              diagnostics: [{ message: "Database column does not exist", code: "42703" }],
            },
          },
        },
      },
    });
    expect(discoveryOpenApiDocument.components?.schemas?.DiscoveryInternalError).toMatchObject({
      required: ["error"],
      properties: {
        error: {
          required: ["code", "message", "requestId", "reason", "stage", "diagnostics"],
          properties: {
            code: { type: "string", enum: ["INTERNAL_ERROR"] },
            message: { type: "string" },
            requestId: { type: "string", format: "uuid" },
            reason: {
              type: "string",
              enum: ["DATABASE_UNAVAILABLE", "DATABASE_ACCESS_DENIED", "DATABASE_SCHEMA_MISMATCH", "INITIALIZATION_FAILED", "UNEXPECTED_ERROR"],
            },
            stage: { type: "string", enum: ["initialization", "validation", "query", "serialization"] },
            diagnostics: {
              type: "array",
              minItems: 1,
              maxItems: 8,
              items: {
                type: "object",
                required: ["message"],
                properties: {
                  message: { type: "string", maxLength: 500 },
                  code: { type: "string", maxLength: 64 },
                },
              },
            },
          },
        },
      },
    });
    for (const status of ["400", "503"]) {
      expect(operation?.responses[status]).toMatchObject({
        content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
      });
    }
    expect(discoveryOpenApiDocument.components?.schemas?.ApiError).toMatchObject({
      properties: { error: { required: ["code", "message"] } },
    });
  });

  test("provides meaningful populated, empty and paginated discovery examples", () => {
    const response = discoveryOpenApiDocument.paths["/api/sessions"]?.get?.responses["200"];
    if (!response || !("content" in response)) throw new Error("Missing discovery response");
    const examples = response.content?.["application/json"]?.examples;
    if (!examples) throw new Error("Missing discovery examples");
    const populated = examples.populated;
    const empty = examples.empty;
    const pagination = examples.pagination;
    if (!populated || !("value" in populated) || !empty || !("value" in empty) || !pagination || !("value" in pagination)) {
      throw new Error("Discovery examples must be inline values");
    }
    expect(populated.value.items).toHaveLength(1);
    expect(populated.value.nextCursor).toBeNull();
    expect(empty.value).toEqual({ items: [], nextCursor: null });
    expect(pagination.value.items).toHaveLength(20);
    expect(new Set(pagination.value.items.map((item: { sessionId: string }) => item.sessionId)).size).toBe(20);
    expect(JSON.parse(Buffer.from(pagination.value.nextCursor, "base64url").toString("utf8"))).toEqual({
      startAt: pagination.value.items.at(-1).startAt,
      sessionId: pagination.value.items.at(-1).sessionId,
    });
  });
});
