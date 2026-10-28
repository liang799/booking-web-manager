import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "@/app/openapi/contracts";

/** Public readiness metadata; not a bearer- or cookie-authenticated operation. */
export function registerHealthApi(registry: OpenAPIRegistry): void {
  const readySchema = registry.register("ApiHealthReady", z.object({ status: z.literal("ok") }));
  const unavailableSchema = registry.register("ApiHealthUnavailable", z.object({ status: z.literal("unavailable") }));
  const noStore = { "Cache-Control": { schema: { type: "string" as const, enum: ["no-store"] } } };
  registry.registerPath({
    method: "get",
    path: "/api/health",
    operationId: "apiHealth",
    tags: ["System"],
    summary: "API readiness",
    description: "Public, read-only readiness probe. Checks required server configuration and a zero-row SELECT against the sessions table. Does not check live Supabase Auth, payment providers, or user permissions, and never exposes database errors or credentials. Responses must not be cached.",
    security: [],
    responses: {
      200: {
        description: "Required server configuration and session-table read access are ready.",
        headers: noStore,
        content: { "application/json": { schema: readySchema, example: { status: "ok" } } },
      },
      503: {
        description: "Required configuration, database connectivity, or session-table access is unavailable. No internal details are returned.",
        headers: noStore,
        content: { "application/json": { schema: unavailableSchema, example: { status: "unavailable" } } },
      },
    },
  });
}
