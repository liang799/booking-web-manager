import { readDiscovery } from "@/app/discover/client-read";
import type { DiscoveryPage } from "@/app/discover/contracts";
import type { DiscoveryExpiry } from "@/app/discover/_components/discovery-updates";

export interface HomeDiscoveryPage {
  readonly page: DiscoveryPage;
  readonly expiry: DiscoveryExpiry | null;
  readonly receivedAt: number;
  readonly readDuration: number;
}
export type ReadHomeDiscoveryPage = (cursor: string | null, signal: AbortSignal) => Promise<HomeDiscoveryPage>;

/** Reuse the authenticated discovery projection and its server-anchored expiry. */
export const readHomeDiscoveryPage: ReadHomeDiscoveryPage = async (cursor, signal) => {
  const startedAt = performance.now();
  const query = cursor === null ? "" : new URLSearchParams({ cursor }).toString();
  const result = await readDiscovery(query, signal);
  if (result === null || signal.aborted) throw new DOMException("Discovery read cancelled", "AbortError");
  if (result.outcome.status !== "ready") {
    throw new Error(result.outcome.status === "error" && result.outcome.kind === "unavailable"
      ? "Session discovery is temporarily unavailable. Please try again."
      : "We couldn't load sessions. Please try again.");
  }
  const receivedAt = performance.now();
  return { page: result.outcome.page, expiry: result.expiry, receivedAt, readDuration: receivedAt - startedAt };
};
