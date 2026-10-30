"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { HomeOutcome } from "../types";
import { HomeView } from "./home-view";
import { MobileHomeDiscovery } from "./home-discovery-feed";

/** Server props own the diary; retry adds only React's transient pending state. */
export function HomeController({ outcome }: { readonly outcome: HomeOutcome }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <HomeView state={pending ? { status: "loading" } : outcome} onRetry={() => startTransition(() => router.refresh())} discovery={<MobileHomeDiscovery onJoined={() => router.refresh()} />} />;
}
