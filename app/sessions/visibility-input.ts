import { z } from "zod";
import { invalidRequest } from "@/app/http/request-failure";

export const sessionVisibilityRequestSchema = z.object({ visibility: z.enum(["PUBLIC", "PRIVATE"]) });
export const sessionVisibilityParamsSchema = z.object({ sessionId: z.string().uuid() });

/** Validates a session UUID and explicit visibility target, throwing an invalid-request failure for malformed input. */
export function parseSessionVisibilityInput(sessionId: unknown, body: unknown) {
  const params = sessionVisibilityParamsSchema.safeParse({ sessionId });
  const input = sessionVisibilityRequestSchema.safeParse(body);
  if (!params.success || !input.success) throw invalidRequest("Invalid session visibility request");
  return { sessionId: params.data.sessionId, visibility: input.data.visibility };
}
