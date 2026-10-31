import type { UUID } from "@/domain";
import type { DiscoveryExpiry } from "./_components/discovery-updates";
import type { DiscoveryOutcome } from "./_components/discovery-state";
import { toDiscoveryPage } from "./contracts";
import { DiscoveryApiUnavailableError } from "./discovery-api-unavailable";
import { parseDiscoveryQuery } from "./query";
import { getDiscoveryDependencies } from "./server-dependencies";

export type PageSearchParams = Record<string, string | string[] | undefined>;

/** The calling page verifies the viewer, whose active participation is excluded from results. */
export async function loadDiscoveryScreen(searchParams: PageSearchParams, viewerId: UUID) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(searchParams)) {
    if (name === "returnTo") continue;
    if (Array.isArray(value)) value.forEach((item) => params.append(name, item));
    else if (value !== undefined) params.append(name, value);
  }
  const parsed = parseDiscoveryQuery(params);
  let outcome: DiscoveryOutcome;
  if (parsed.status === "invalid") outcome = { status: "invalid", fieldErrors: parsed.fieldErrors };
  else {
    try {
      const { discoverSessions } = await getDiscoveryDependencies();
      const sessions = await discoverSessions.searchPublic(parsed.criteria, viewerId);
      outcome = { status: "ready", page: toDiscoveryPage(sessions, parsed.after) };
    } catch (error) {
      outcome = { status: "error", kind: error instanceof DiscoveryApiUnavailableError ? "unavailable" : "unexpected" };
    }
  }
  const startsAt = outcome.status === "ready" ? outcome.page.items[0]?.startAt : undefined;
  const expiry: DiscoveryExpiry | null = startsAt === undefined
    ? null : { startsAt: Date.parse(startsAt), serverNow: Date.now() };
  return { queryKey: parsed.queryKey, filters: parsed.filters, outcome, expiry };
}
