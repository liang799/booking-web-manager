"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Money } from "@/components/ui/money";
import { SessionFeedLoadError, loadSessionFeed as defaultLoadFeed, type LoadSessionFeed } from "../session-feed-transport";
import type { SessionFeedItem, SessionFeedTab } from "../session-feed-contract";
import type { SessionAccountAction } from "../session-actions";
import { HostedSessionsLoadError, loadHostedSessions as defaultLoadHosted, type LoadHostedSessions } from "../hosted-sessions-transport";
import { executeSessionCancellation, executeSessionVisibility, loadCancellationPreview } from "../session-action-transport";
import { HostedSessionsView } from "./hosted-sessions-view";
import { SessionCancellationDialog } from "./session-cancellation-dialog";
import type { HostedSessionItem } from "../types";
import type { SessionCancellationResult } from "@/use-cases/sessions/session-cancellation-transaction";
import { hostedSessionsQueryKey } from "./hosted-sessions-controller";
import { SessionDetails, SessionsView } from "./sessions-view";
import { SessionsUiProvider, useSessionsUiStore } from "./sessions-ui-provider";
import { sessionArtwork, sessionStatus, sessionTitle } from "./session-display";
import styles from "./sessions.module.css";

export const sessionFeedQueryKey = ["sessions", "feed"] as const;

interface SessionsControllerProps {
  readonly userId: string;
  readonly actions: readonly SessionAccountAction[];
  readonly loadFeed?: LoadSessionFeed;
  readonly loadHosted?: LoadHostedSessions;
}

/** A new account gets fresh UI state; React Query owns the account-scoped feed. */
export function SessionsController(props: SessionsControllerProps) {
  const params = useSearchParams();
  const initialTab = params.get("tab") === "hosting" || params.get("created") === "1" ? "hosting" : "joined";
  return <SessionsUiProvider key={props.userId} initialTab={initialTab}><SessionsContent {...props} initialTab={initialTab} /></SessionsUiProvider>;
}

/** Loading another page retains already loaded cards. */
function SessionsContent({ userId, actions, loadFeed = defaultLoadFeed, loadHosted = defaultLoadHosted, initialTab }: SessionsControllerProps & { readonly initialTab: SessionFeedTab }) {
  const params = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const tab = useSessionsUiStore((state) => state.tab);
  const setTab = useSessionsUiStore((state) => state.selectTab);
  const selectedSessionId = useSessionsUiStore((state) => state.selectedSessionId);
  const setSelected = useSessionsUiStore((state) => state.selectSession);
  const [cancelling, setCancelling] = useState<HostedSessionItem | null>(null);
  const [cancelled, setCancelled] = useState<SessionCancellationResult | null>(null);
  const cancellationTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { setTab(initialTab); }, [initialTab, setTab]);
  const feed = useInfiniteQuery({
    queryKey: [...sessionFeedQueryKey, userId, tab],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => loadFeed({ tab, cursor: pageParam, signal }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
    retry: false,
  });
  const sessions = useMemo(() => {
    const unique = new Map<string, SessionFeedItem>();
    for (const page of feed.data?.pages ?? []) for (const session of page.sessions) unique.set(session.sessionId, session);
    return Array.from(unique.values());
  }, [feed.data]);
  const selected = sessions.find((session) => session.sessionId === selectedSessionId) ?? null;
  const first = feed.data?.pages[0];
  const signIn = feed.error instanceof SessionFeedLoadError && feed.error.signIn;
  const loginPath = feed.error instanceof SessionFeedLoadError && feed.error.code === "UNAUTHENTICATED" ? "/login?next=%2Fsessions" : "/login";
  useEffect(() => { if (signIn) router.replace(loginPath); }, [signIn, loginPath, router]);
  const loadMore = useCallback(() => { if (feed.hasNextPage && !feed.isFetching) void feed.fetchNextPage(); }, [feed.hasNextPage, feed.isFetching, feed.fetchNextPage]);
  const retry = () => { if (feed.isFetchNextPageError) void feed.fetchNextPage(); else void feed.refetch(); };
  const refresh = () => {
    router.refresh();
    void queryClient.invalidateQueries({ queryKey: sessionFeedQueryKey });
    void queryClient.invalidateQueries({ queryKey: hostedSessionsQueryKey });
  };
  return <>
    {params.get("created") === "1" && <p role="status" className="px-6 pt-4 text-sm text-success md:px-10">Your session was created successfully.</p>}
    {cancelled && <p role="status" className="px-6 pt-4 text-sm md:px-10">Session cancelled. <Money cents={cancelled.totalRefundCents} /> refunded to {cancelled.refundRecipientCount} participants.</p>}
    <SessionsView tab={tab} onTabChange={(next) => {
      setTab(next);
      const search = new URLSearchParams(params.toString());
      search.set("tab", next);
      search.delete("created");
      router.replace(`/sessions?${search}`, { scroll: false });
    }} sessions={sessions} asOf={first?.asOf ?? new Date().toISOString()} upcomingCount={first?.upcomingCount ?? 0} pastCount={first?.pastCount ?? 0} actions={actions}
      loading={feed.isPending || signIn} error={!signIn && feed.isError ? feed.error instanceof SessionFeedLoadError && feed.error.kind === "unavailable" ? "Your sessions are temporarily unavailable." : "We couldn’t load your sessions. Please try again." : undefined}
      loadingMore={feed.isFetchingNextPage} hasMore={feed.hasNextPage} onLoadMore={loadMore} onRetry={retry} onOpenSession={(session) => setSelected(session.sessionId)} />
    <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <DialogContent className={`${styles.dialogContent} sm:max-w-[680px]`}>
        {selected && <>
          <DialogHeader><DialogTitle className={styles.dialogHeading}>{sessionTitle(selected)}</DialogTitle><DialogDescription>{selected.venueName} · {selected.role === "HOST" ? "Manage your session" : sessionStatus(selected)}</DialogDescription></DialogHeader>
          {selected.role === "HOST" ? <HostedSessionManagement userId={userId} session={selected} loadHosted={loadHosted} onRefresh={refresh} onCancel={(session, trigger) => { cancellationTrigger.current = trigger; setCancelling(session); }} /> : <>
            <div className={styles.dialogHero}><Image src={sessionArtwork(selected)} alt="" fill sizes="680px" className={styles.photo} /></div>
            <SessionDetails session={selected} footer={false} />
          </>}
        </>}
      </DialogContent>
    </Dialog>
    <SessionCancellationDialog selected={cancelling} transport={{ userId, preview: loadCancellationPreview, cancel: executeSessionCancellation }}
      onClose={() => setCancelling(null)} onRestoreFocus={() => {
        if (cancellationTrigger.current?.isConnected) cancellationTrigger.current.focus();
        else document.getElementById("sessions-heading")?.focus();
      }} onCancelled={(result) => { setCancelled(result); setSelected(null); }} onRefresh={refresh} />
  </>;
}

function HostedSessionManagement({ userId, session, loadHosted, onRefresh, onCancel }: { readonly userId: string; readonly session: SessionFeedItem; readonly loadHosted: LoadHostedSessions; readonly onRefresh: () => void; readonly onCancel: (session: HostedSessionItem, trigger: HTMLButtonElement) => void }) {
  const query = useQuery({ queryKey: [...hostedSessionsQueryKey, userId], queryFn: ({ signal }) => loadHosted(signal), retry: false });
  if (query.isPending) return <LoadingSpinner label="Loading session controls…" />;
  if (query.isError) return <div className="space-y-4"><p role="alert">{query.error instanceof HostedSessionsLoadError && query.error.signIn ? "Your sign-in has expired. Sign in again to manage this session." : "We couldn’t load session controls."}</p>{query.error instanceof HostedSessionsLoadError && query.error.signIn ? <Link href="/login?next=%2Fsessions" className={styles.primaryButton}>Sign in</Link> : <button className={styles.secondaryButton} onClick={() => void query.refetch()}>Try again</button>}</div>;
  const managed = query.data.sessions.filter((item) => item.sessionId === session.sessionId);
  const attendance = query.data.awaitingAttendance.filter((item) => item.sessionId === session.sessionId);
  return <>
    {session.section === "upcoming" || managed.length > 0 || attendance.length > 0 ? <HostedSessionsView embedded outcome={{ status: "ready", sessions: managed, awaitingAttendance: attendance }} actions={[]} refreshing={query.isFetching}
      onSetVisibility={(_id, action) => executeSessionVisibility(action)} onRefresh={onRefresh}
      onRequestCancellation={onCancel} />
      : <><SessionDetails session={session} footer={false} /><Link className={styles.primaryButton} href={`/sessions/${session.sessionId}/participants`}>View participants</Link></>}
  </>;
}
