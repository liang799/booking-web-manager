"use client";

import { z } from "zod";
import { sessionFeedResponseSchema, type SessionFeedResponse, type SessionFeedTab } from "./session-feed-contract";

export const SESSION_FEED_URL = "/api/sessions/mine";
const failureSchema = z.object({ error: z.object({ code: z.string() }) });

export class SessionFeedLoadError extends Error {
  constructor(readonly code: string, readonly kind: "unavailable" | "unexpected", readonly signIn: boolean) {
    super(code);
    this.name = "SessionFeedLoadError";
  }
}

export type LoadSessionFeed = (input: {
  readonly tab: SessionFeedTab;
  readonly cursor?: string | null;
  readonly signal?: AbortSignal;
}) => Promise<SessionFeedResponse>;

/** React Query supplies the cursor and abort signal; identity comes only from the login cookie. */
export const loadSessionFeed: LoadSessionFeed = async ({ tab, cursor, signal }) => {
  const parameters = new URLSearchParams({ tab });
  if (cursor) parameters.set("cursor", cursor);
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(20_000);
    response = await fetch(`${SESSION_FEED_URL}?${parameters}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new SessionFeedLoadError("NETWORK_ERROR", "unexpected", false);
  }
  let body: unknown;
  try { body = await response.json(); } catch {
    if (response.ok) throw new SessionFeedLoadError("UNEXPECTED_RESPONSE", "unexpected", false);
  }
  if (response.ok) {
    const parsed = sessionFeedResponseSchema.safeParse(body);
    if (!parsed.success) throw new SessionFeedLoadError("UNEXPECTED_RESPONSE", "unexpected", false);
    return parsed.data;
  }
  const failure = failureSchema.safeParse(body);
  const code = failure.success ? failure.data.error.code
    : response.status === 401 ? "UNAUTHENTICATED"
      : response.status === 503 ? "SESSION_MANAGEMENT_UNAVAILABLE" : "UNEXPECTED_ERROR";
  throw new SessionFeedLoadError(
    code,
    code === "SESSION_MANAGEMENT_UNAVAILABLE" ? "unavailable" : "unexpected",
    ["UNAUTHENTICATED", "INACTIVE_ACCOUNT", "NOT_FOUND"].includes(code),
  );
};
