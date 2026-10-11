import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import type { ActionError } from "./withdrawal-ports";

/**
 * Shared HTTP handling for the UC2-05 session-action transports (withdraw, leave the waitlist,
 * accept a replacement): send as the signed-in user, and classify failures so a request that may
 * have reached the server is retried with the same idempotency key.
 */
export type SentRequest = { readonly status: "sent"; readonly response: Response; readonly body: unknown } | ActionError;

const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

/** Sends one request as the signed-in user. A network failure is unconfirmed: it may have reached the server. */
export async function sendAsSignedInUser(url: string, init: RequestInit, messages: {
  readonly unconfirmed: string;
  readonly signedOut: string;
}): Promise<SentRequest> {
  let token: string | undefined;
  try {
    const { data, error } = await createClient().auth.getSession();
    if (error) throw error;
    token = data.session?.access_token;
  } catch {
    return { status: "error", code: "AUTH_UNAVAILABLE", message: "We couldn't check your sign-in. Please try again.", unconfirmed: false };
  }
  if (!token) return { status: "error", code: "UNAUTHENTICATED", message: messages.signedOut, unconfirmed: false };

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { status: "error", code: "UNKNOWN_RESULT", message: messages.unconfirmed, unconfirmed: true };
  }
  try {
    return { status: "sent", response, body: await response.json() };
  } catch {
    return { status: "sent", response, body: undefined };
  }
}

/** Maps a failure reply: a 5xx, 408, 429 or unreadable reply never proves nothing happened; other 4xx are definite rejections. */
export function actionFailure(sent: Extract<SentRequest, { status: "sent" }>, messages: {
  readonly unconfirmed: string;
  readonly byCode: Readonly<Record<string, string>>;
  readonly fallback: string;
}): ActionError {
  const parsed = errorSchema.safeParse(sent.body);
  const code = parsed.success ? parsed.data.error.code : "UNEXPECTED_ERROR";
  // 408 and 429 can come from a proxy after the request already reached the server.
  if (sent.response.ok || sent.response.status >= 500 || sent.response.status === 408 || sent.response.status === 429) {
    return { status: "error", code, message: messages.unconfirmed, unconfirmed: true };
  }
  return { status: "error", code, message: messages.byCode[code] ?? messages.fallback, unconfirmed: false };
}
