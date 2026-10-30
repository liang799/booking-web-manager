"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { QueryProvider } from "@/app/_components/query-provider";
import { joinSession as defaultJoinSession, type JoinSession } from "@/app/commit/join-session-transport";
import { subscribeToDiscoveryChanges } from "@/app/discover/client-updates";
import { startDiscoveryUpdates, type DiscoveryUpdates } from "@/app/discover/_components/discovery-updates";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { readHomeDiscoveryPage, type ReadHomeDiscoveryPage } from "../discovery-feed";
import { HomeDiscoveryCard } from "./home-discovery-card";

export const homeDiscoveryQueryKey = ["sessions", "discovery", "home"] as const;
interface HomeDiscoveryProps {
  readonly readPage?: ReadHomeDiscoveryPage;
  readonly joinSession?: JoinSession;
  readonly onJoined?: () => void;
  readonly subscribe?: typeof subscribeToDiscoveryChanges;
}

const mobileQuery = "(max-width: 767px)";
const isMobile = () => window.matchMedia(mobileQuery).matches;
const serverMobile = () => false;
function subscribeViewport(onChange: () => void) {
  const viewport = window.matchMedia(mobileQuery);
  viewport.addEventListener("change", onChange);
  return () => viewport.removeEventListener("change", onChange);
}

/** Mount the query only on mobile. The cache belongs to this Home screen. */
export function MobileHomeDiscovery(props: HomeDiscoveryProps) {
  const mobile = useSyncExternalStore(subscribeViewport, isMobile, serverMobile);
  return <QueryProvider>{mobile && <HomeDiscoveryFeed {...props} />}</QueryProvider>;
}

export function HomeDiscoveryFeed({ readPage = readHomeDiscoveryPage, joinSession = defaultJoinSession, onJoined, subscribe = subscribeToDiscoveryChanges }: HomeDiscoveryProps) {
  const client = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: homeDiscoveryQueryKey,
    queryFn: ({ pageParam, signal }) => readPage(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last, _pages, _lastParam, params) => last.page.nextCursor !== null && !params.includes(last.page.nextCursor) ? last.page.nextCursor : undefined,
    retry: false,
    // The shared scheduler handles visible/online reconciliation and server expiry.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const fetching = useRef(query.isFetching);
  fetching.current = query.isFetching;
  const updatesRef = useRef<DiscoveryUpdates | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updates = startDiscoveryUpdates({
      initialRefresh: false,
      refresh: () => { void client.invalidateQueries({ queryKey: homeDiscoveryQueryKey }, { cancelRefetch: false }).finally(() => updates.complete()); },
      canRefresh: () => !fetching.current,
      subscribe, document, window, online: () => navigator.onLine,
    });
    updatesRef.current = updates;
    return () => { updates.stop(); updatesRef.current = null; };
  }, [client, subscribe]);

  useEffect(() => {
    if (query.isFetching) return;
    const first = query.data?.pages.find((page) => page.expiry !== null);
    updatesRef.current?.expireAt(first?.expiry ?? null, first ? first.readDuration + performance.now() - first.receivedAt : 0);
    updatesRef.current?.complete();
  }, [query.data, query.isFetching]);

  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetching && !query.isError) void query.fetchNextPage({ cancelRefetch: false });
  }, [query.hasNextPage, query.isFetching, query.isError, query.fetchNextPage]);
  const continuation = query.data?.pages.at(-1)?.page.nextCursor;
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !query.hasNextPage || query.isFetching || query.isError || !("IntersectionObserver" in window)) return;
    let requested = false;
    const observer = new IntersectionObserver((entries) => {
      if (!requested && entries.some((entry) => entry.isIntersecting)) {
        requested = true;
        observer.disconnect();
        loadMore();
      }
    }, { rootMargin: "200px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [continuation, query.hasNextPage, query.isFetching, query.isError, loadMore]);

  const joinAndRefresh = useCallback<JoinSession>(async (request) => {
    const result = await joinSession(request);
    if (result.status === "committed" || result.status === "waitlisted") onJoined?.();
    return result;
  }, [joinSession, onJoined]);
  const seen = new Set<string>();
  const items = (query.data?.pages.flatMap((page) => page.page.items) ?? []).filter((item) => {
    if (seen.has(item.sessionId)) return false;
    seen.add(item.sessionId);
    return true;
  });

  return <section id="discover-bookings" aria-labelledby="discover-bookings-heading" aria-busy={query.isFetching} className="px-6 pb-12">
    <h2 id="discover-bookings-heading" className="mb-4 text-2xl font-bold leading-8 tracking-tight">Discover Bookings</h2>
    <p className="sr-only" aria-live="polite">{items.length} public sessions loaded.</p>
    {query.isPending ? <LoadingSpinner label={query.isPaused ? "Waiting for a connection…" : "Loading sessions…"} />
      : query.data && items.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No upcoming public sessions yet. Check back soon for your next game.</p>
      : items.length > 0 && <ul aria-label="Discover bookings" className="space-y-7">{items.map((session) => <HomeDiscoveryCard key={session.sessionId} session={session} joinSession={joinAndRefresh} />)}</ul>}
    {query.isError && <div className="mt-4 space-y-3"><ErrorMessage>{query.error.message}</ErrorMessage><Button variant="outline" className="min-h-11" disabled={query.isFetching} onClick={() => { void (query.isFetchNextPageError ? query.fetchNextPage({ cancelRefetch: false }) : query.refetch()); }}>Retry discovery</Button></div>}
    {query.isFetchingNextPage && <div className="mt-5"><LoadingSpinner label="Loading more sessions…" /></div>}
    <div ref={sentinel} data-discovery-sentinel aria-hidden="true" className="h-px" />
    {query.hasNextPage && !query.isError && <Button variant="outline" className="mt-5 min-h-11 w-full" disabled={query.isFetching} onClick={loadMore}>Load more sessions</Button>}
    {query.data && !query.hasNextPage && items.length > 0 && <p className="mt-6 text-center text-xs text-muted-foreground">You're up to date with upcoming sessions.</p>}
  </section>;
}
