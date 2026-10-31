import { z } from "zod";
import { MAX_STORED_SESSION_SLOTS } from "@/domain/sessions/capacity";
import type { DiscoveryOutcome } from "./_components/discovery-state";
import type { DiscoveryExpiry } from "./_components/discovery-updates";

const pageSchema = z.object({
  items: z.array(z.object({
    sessionId: z.string().uuid(),
    venueName: z.string(),
    sport: z.string(),
    region: z.string(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    totalSlots: z.number().int().min(1).max(MAX_STORED_SESSION_SLOTS),
    bookingShareCents: z.number().int().positive().safe(),
  })).max(20),
  nextCursor: z.string().nullable(),
});

export interface DiscoveryRead {
  readonly outcome: DiscoveryOutcome;
  readonly expiry: DiscoveryExpiry | null;
}

const failed = (kind: "unavailable" | "unexpected"): DiscoveryRead => ({
  outcome: { status: "error", kind }, expiry: null,
});

/** Reads the public projection directly; cancellation belongs to the current page owner. */
export async function readDiscovery(query: string, signal: AbortSignal): Promise<DiscoveryRead | null> {
  if (signal.aborted) return null;
  const request = new AbortController();
  const abort = () => request.abort();
  signal.addEventListener("abort", abort, { once: true });
  // A stalled transport must release the scheduler so subsequent hints can recover.
  const timeout = setTimeout(abort, 10_000);
  try {
    const response = await fetch(`/api/sessions${query === "" ? "" : `?${query}`}`, {
      cache: "no-store", signal: request.signal,
    });
    if (!response.ok) return failed(response.status === 503 ? "unavailable" : "unexpected");
    const page = pageSchema.parse(await response.json());
    const timing = response.headers.get("X-Server-Time");
    const serverNow = timing === null || timing.trim() === "" ? NaN : Number(timing);
    if (!Number.isSafeInteger(serverNow) || serverNow < 0) return failed("unexpected");
    if (signal.aborted) return null;
    const first = page.items[0];
    return {
      outcome: { status: "ready", page },
      expiry: first === undefined ? null : { startsAt: Date.parse(first.startAt), serverNow },
    };
  } catch {
    return signal.aborted ? null : failed("unexpected");
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
