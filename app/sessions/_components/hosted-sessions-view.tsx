"use client";

import Link from "next/link";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorMessage } from "@/components/ui/error-message";
import type { SessionVisibilityActionResult } from "../actions";
import type { AttendanceDueItem, HostedSessionItem, HostedSessionsOutcome } from "../types";
import { SessionCancellationDialog, type CancellationTransport } from "./session-cancellation-dialog";
import type { SessionCancellationResult } from "@/use-cases/sessions/session-cancellation-transaction";
import { Money } from "@/components/ui/money";
import type { SessionAccountAction, SetSessionVisibilityAction } from "../session-actions";
import { SessionInvitationShare } from "./session-invitation-share";
import details from "./session-details.module.css";

export interface HostedSessionsViewProps {
  /** The overview opens the existing management workflow inside a session dialog. */
  readonly embedded?: boolean;
  /** A parent overview can own cancellation recovery even when this panel is closed. */
  readonly onRequestCancellation?: (session: HostedSessionItem, trigger: HTMLButtonElement) => void;
  readonly outcome: HostedSessionsOutcome;
  readonly actions: readonly SessionAccountAction[];
  readonly refreshing: boolean;
  readonly onSetVisibility: (sessionId: string, action: SetSessionVisibilityAction) => Promise<SessionVisibilityActionResult>;
  readonly onRefresh: () => void;
  readonly cancellation?: CancellationTransport;
}

/** Renders hosted sessions, an empty state, or a retryable loading error. */
export function HostedSessionsView({ outcome, actions, refreshing, onSetVisibility, onRefresh, cancellation, embedded = false, onRequestCancellation }: HostedSessionsViewProps) {
  const [selected, setSelected] = useState<HostedSessionItem | null>(null);
  const [cancelled, setCancelled] = useState<SessionCancellationResult | null>(null);
  const cancellationTrigger = useRef<HTMLButtonElement | null>(null);
  const creation = actions.find((action) => action.name === "create-session");
  const emailSetup = actions.find((action) => action.name === "add-email");
  return (
    <div className={embedded ? "w-full" : "mx-auto w-full max-w-5xl px-6 pb-10 pt-6 md:px-8 md:pt-10"}>
      {!embedded && <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Sessions you host</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Manage your upcoming sessions. Public sessions appear in Discover.</p>
        {creation && <Button asChild className="mt-4 min-h-11"><Link href={creation.href}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Create a session</Link></Button>}
        {emailSetup && <div className="mt-4 space-y-2"><p className="text-sm text-muted-foreground">Add an email address before creating a session.</p><Button asChild variant="outline" className="min-h-11"><Link href={emailSetup.href}>Add email</Link></Button></div>}
      </header>}
      {outcome.status === "ready" && (outcome.awaitingAttendance?.length ?? 0) > 0 && <AttendanceDueList sessions={outcome.awaitingAttendance!} />}
      {cancelled && <p role="status" className="mb-4 rounded-lg border p-4">Session cancelled.{" "}
        <Money cents={cancelled.totalRefundCents} /> refunded to {cancelled.refundRecipientCount} participants.</p>}
      {cancellation && <SessionCancellationDialog selected={selected} transport={cancellation}
        onClose={() => setSelected(null)} onRestoreFocus={() => cancellationTrigger.current?.focus()}
        onCancelled={setCancelled} onRefresh={onRefresh} />}
      {outcome.status === "error" ? (
        <div className="space-y-3">
          <ErrorMessage>{outcome.kind === "unavailable" ? "Session management is temporarily unavailable." : "We couldn't load your sessions. Please try again."}</ErrorMessage>
          <Button variant="outline" disabled={refreshing} onClick={onRefresh}>{refreshing ? "Loading…" : "Retry"}</Button>
        </div>
      ) : outcome.sessions.length === 0 && !(embedded && (outcome.awaitingAttendance?.length ?? 0) > 0) ? (
        <div className="space-y-4">
          <EmptyState title="No upcoming sessions to manage" description="Your open, upcoming sessions will appear here." />
          <Button asChild variant="outline"><Link href="/discover?returnTo=%2Fsessions">Find a session</Link></Button>
        </div>
      ) : (
        <ul className="space-y-4">
          {outcome.sessions.map((session) => <HostedSessionCard key={session.sessionId} session={session}
            refreshing={refreshing} onSetVisibility={onSetVisibility} onRefresh={onRefresh}
            onCancel={onRequestCancellation ? (trigger) => onRequestCancellation(session, trigger) : cancellation ? (trigger) => { cancellationTrigger.current = trigger; setSelected(session); } : undefined} />)}
        </ul>
      )}
    </div>
  );
}

const singaporeDateTime = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
});

/** Displays confirmed session visibility with capacity guards and per-session save feedback. */
function HostedSessionCard({ session, refreshing, onSetVisibility, onRefresh, onCancel }: Pick<HostedSessionsViewProps, "refreshing" | "onSetVisibility" | "onRefresh"> & { readonly session: HostedSessionItem; readonly onCancel?: (trigger: HTMLButtonElement) => void }) {
  return (
    <li className="rounded-lg border bg-card p-4 shadow-sm md:p-6">
      <article aria-label={`${session.sport} at ${session.venueName}`} className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-lg font-semibold">{session.venueName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{session.sport} · {session.region}</p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{session.visibility === "PUBLIC" ? "Public" : "Private"}</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground"><time dateTime={session.startAt}>{singaporeDateTime.format(new Date(session.startAt))}</time> – <time dateTime={session.endAt}>{singaporeDateTime.format(new Date(session.endAt))}</time> SGT</p>
        <HostedSessionControls session={session} refreshing={refreshing} onSetVisibility={onSetVisibility} onRefresh={onRefresh} onCancel={onCancel} />
      </article>
    </li>
  );
}

/** Shares visibility submission guards and feedback between the list and Session Details. */
export function HostedSessionControls({ session, refreshing, onSetVisibility, onRefresh, onCancel, participants }: Pick<HostedSessionsViewProps, "refreshing" | "onSetVisibility" | "onRefresh"> & {
  readonly session: HostedSessionItem;
  readonly onCancel?: (trigger: HTMLButtonElement) => void;
  readonly participants?: { readonly participantCount: number; readonly capacity: number };
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SessionVisibilityActionResult | null>(null);
  const submitting = useRef(false);
  const visibilityAction = session.actions.find((action) => action.name === "set-visibility");
  const cancellationAction = session.actions.find((action) => action.name === "preview-cancellation");

  /** Submits one visibility change at a time and refreshes server state after success or a conflict. */
  async function changeVisibility() {
    if (submitting.current || refreshing || !visibilityAction) return;
    submitting.current = true;
    setPending(true);
    setResult(null);
    try {
      const saved = await onSetVisibility(session.sessionId, visibilityAction);
      setResult(saved);
      if (saved.status === "saved" || saved.refresh) onRefresh();
    } catch {
      setResult({ status: "error", code: "UNEXPECTED_ERROR", message: "We couldn't change visibility. Please try again.", refresh: false });
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  if (participants !== undefined) return <>
    <div className={details.managementRow}>
      <div><h3>Participants</h3><p className={details.count} aria-label={`${participants.participantCount} of ${participants.capacity} players joined`}><strong>{participants.participantCount} / {participants.capacity}</strong><span>players joined</span></p></div>
      <Button asChild variant="secondary" className={details.manageButton}><Link href={`/sessions/${session.sessionId}/participants`}>Manage players<ChevronRight aria-hidden className="ml-2 h-4 w-4" /></Link></Button>
    </div>
    <div className={details.managementRow}>
      <div><h3>Visibility</h3>
        <p className={details.visibilityDescription}>{session.visibility === "PUBLIC" ? "Listed in Discover. Anyone can find your session." : "Hidden from Discover. Invite players with your invitation link."}</p>
        {!visibilityAction && <p className={details.visibilityDescription}>Visibility cannot be changed for this session.</p>}
      </div>
      <div role="group" aria-label="Session visibility" className={details.segment}>
        {(["PUBLIC", "PRIVATE"] as const).map((visibility) => <button key={visibility} type="button" aria-pressed={session.visibility === visibility}
          aria-label={session.visibility === visibility ? visibility === "PUBLIC" ? "Public" : "Private" : `Change visibility to ${visibility.toLowerCase()}`}
          disabled={pending || refreshing || (session.visibility !== visibility && visibilityAction?.inputs.visibility !== visibility)}
          onClick={() => { if (session.visibility !== visibility && visibilityAction?.inputs.visibility === visibility) void changeVisibility(); }}>
          {visibility === "PUBLIC" ? "Public" : "Private"}
        </button>)}
      </div>
    </div>
    {pending && <p role="status" className={details.feedback}>Saving visibility…</p>}
    {result?.status === "error" && <div className="mb-4"><ErrorMessage>{result.message}</ErrorMessage></div>}
    {result?.status === "saved" && result.visibility === session.visibility && <p role="status" className="mb-4 text-sm text-muted-foreground">Session is now {result.visibility.toLowerCase()}.</p>}
    <div className={details.hostFooter}>
      <SessionInvitationShare sessionId={session.sessionId} disabled={pending || refreshing} presentation="details" />
      {onCancel && cancellationAction && <>
        <button type="button" className={details.cancelButton} disabled={pending || refreshing} onClick={(event) => onCancel(event.currentTarget)}><Trash2 aria-hidden /><span>Cancel session</span></button>
      </>}
    </div>
  </>;
  return <>
    <p className="mt-3 text-sm">{session.visibility === "PUBLIC" ? "Visible in Discover." : "Hidden from Discover."}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button asChild variant="outline" className="min-h-11"><Link href={`/sessions/${session.sessionId}/participants`}>Manage participants</Link></Button>
          {visibilityAction && <Button variant="outline" className="min-h-11" disabled={pending || refreshing} onClick={changeVisibility}>
            {pending ? "Saving…" : visibilityAction.inputs.visibility === "PUBLIC" ? "Make public" : "Make private"}
          </Button>}
          {onCancel && cancellationAction && <Button variant="destructive" className="min-h-11" disabled={pending || refreshing} onClick={(event) => onCancel(event.currentTarget)}>Cancel session</Button>}
          {!visibilityAction && <p className="text-sm text-muted-foreground">Visibility cannot be changed for this session.</p>}
        </div>
        <SessionInvitationShare sessionId={session.sessionId} disabled={pending || refreshing} />
        {result?.status === "error" && <div className="mt-3"><ErrorMessage>{result.message}</ErrorMessage></div>}
        {result?.status === "saved" && result.visibility === session.visibility && <p role="status" className="mt-3 text-sm text-muted-foreground">Session is now {result.visibility.toLowerCase()}.</p>}
  </>;
}

/** UC2-06: ended sessions whose committed players the booker still needs to mark attended or absent. */
function AttendanceDueList({ sessions }: { readonly sessions: readonly AttendanceDueItem[] }) {
  return (
    <section aria-labelledby="attendance-due-heading" className="mb-8">
      <h2 id="attendance-due-heading" className="text-lg font-semibold">Check attendance</h2>
      <p className="mt-1 text-sm text-muted-foreground">These sessions have ended. Mark who came so the shares can be paid out to you.</p>
      <ul className="mt-3 space-y-3">
        {sessions.map((session) => (
          <li key={session.sessionId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4 shadow-sm">
            <div className="min-w-0">
              <p className="break-words font-medium">{session.venueName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {session.sport} · ended <time dateTime={session.endAt}>{singaporeDateTime.format(new Date(session.endAt))}</time> SGT
              </p>
              <p className="mt-1 text-sm">{session.unverifiedCount} {session.unverifiedCount === 1 ? "player" : "players"} to check</p>
            </div>
            <Button asChild className="min-h-11"><Link href={`/sessions/${session.sessionId}/participants`}>Check attendance</Link></Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
