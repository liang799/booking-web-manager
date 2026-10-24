import { pathWithNext } from "@/app/(auth)/redirect-path";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { redirect } from "next/navigation";
import { DiscoveryController } from "./_components/discovery-controller";
import { loadDiscoveryScreen, type PageSearchParams } from "./load-screen";
import { discoveryReturnTo } from "./navigation";

export const dynamic = "force-dynamic";

export default async function DiscoveryPage({ searchParams }: {
  readonly searchParams: Promise<PageSearchParams>;
}) {
  // A direct server render must not load listings before authentication.
  // Middleware also protects browser navigation and preserves query parameters.
  const user = await getCurrentUser().catch(() => null);
  if (user === null || user.accountStatus !== "ACTIVE") redirect(pathWithNext("/login", "/discover"));
  const params = await searchParams;
  const screen = await loadDiscoveryScreen(params);
  const returnTo = discoveryReturnTo(params.returnTo);
  return <DiscoveryController key={screen.queryKey} {...screen} returnTo={returnTo} />;
}
