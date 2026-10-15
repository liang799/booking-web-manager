import { z } from "zod";
import { createClient } from "@/lib/supabase/client";

const setupSchema = z.object({
  status: z.enum(["NOT_STARTED", "PENDING", "COMPLETE", "FAILED"]),
  onboardingUrl: z.string().url().optional(),
  instantPayoutsAvailable: z.boolean().optional(),
});
const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export type PayoutSetup = z.infer<typeof setupSchema>;
export type PayoutSetupStatus = PayoutSetup["status"];

export type PayoutLoad =
  | { readonly status: "ready"; readonly data: PayoutSetup }
  | { readonly status: "error"; readonly code: string; readonly message: string };

export interface PayoutTransport {
  readonly load: () => Promise<PayoutLoad>;
  /** Starts or resumes Stripe onboarding; a ready result carries the onboarding link. */
  readonly start: () => Promise<PayoutLoad>;
}

export const PAYOUT_ACCOUNT_URL = "/api/payouts/account";

export const PAYOUT_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  UNAUTHENTICATED: "Log in again to set up payouts.",
  INACTIVE_ACCOUNT: "This account can't receive payouts.",
  PAYOUTS_UNAVAILABLE: "Payouts aren't available yet. Please try again later.",
  PAYOUT_PROVIDER_UNAVAILABLE: "We couldn't reach Stripe. Please try again.",
  NETWORK_ERROR: "We couldn't reach the server. Check your connection and try again.",
};
const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

async function request(method: "GET" | "POST"): Promise<PayoutLoad> {
  let token: string | undefined;
  try {
    const { data } = await createClient().auth.getSession();
    token = data.session?.access_token;
  } catch {
    // Fall through: the server answers 401 and the page offers Log in.
  }
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(PAYOUT_ACCOUNT_URL, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(20_000),
    });
    body = await response.json();
  } catch {
    return { status: "error", code: "NETWORK_ERROR", message: PAYOUT_ERROR_MESSAGES.NETWORK_ERROR! };
  }
  if (response.ok) {
    const parsed = setupSchema.safeParse(body);
    return parsed.success
      ? { status: "ready", data: parsed.data }
      : { status: "error", code: "UNEXPECTED_RESPONSE", message: FALLBACK_MESSAGE };
  }
  const failure = errorSchema.safeParse(body);
  const code = failure.success ? failure.data.error.code : "UNEXPECTED_ERROR";
  return { status: "error", code, message: PAYOUT_ERROR_MESSAGES[code] ?? FALLBACK_MESSAGE };
}

export const payoutTransport: PayoutTransport = {
  load: () => request("GET"),
  start: () => request("POST"),
};
