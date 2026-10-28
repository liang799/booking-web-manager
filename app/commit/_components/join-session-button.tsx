"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ErrorMessage } from "@/components/ui/error-message";
import { InfoNote } from "@/components/ui/info-note";
import { Money } from "@/components/ui/money";
import { joinSession as defaultJoinSession, type JoinSession, type JoinSessionOutcome } from "../join-session-transport";

/** The listing fields the dialog shows. The held amount itself is always computed by the server. */
export interface JoinableSession {
  readonly sessionId: string;
  readonly sport: string;
  readonly venueName: string;
  readonly startAt: string;
  readonly bookingShareCents: number;
}

const singaporeStart = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
});

/**
 * UC2-04 Commit to Session: a Join button whose dialog shows the amount that will be held
 * before the player confirms. After an unconfirmed result the same idempotency key is kept,
 * even if the dialog is closed and reopened, so a retry can never hold the share twice. A new
 * key is made only after a confirmed outcome or an explicit rejection.
 */
export function JoinSessionButton({ session, joinSession = defaultJoinSession, loginHref = "/login?next=%2Fdiscover", emailHref = "/profile/email", roomToken }: {
  readonly session: JoinableSession;
  /** Injected in stories and tests; production calls POST /api/sessions/commit. */
  readonly joinSession?: JoinSession;
  readonly loginHref?: string;
  /** Keeps contextual previews reachable after adding the email required for admission. */
  readonly emailHref?: string;
  readonly roomToken?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<JoinSessionOutcome | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const busy = useRef(false);

  function openDialog() {
    const unconfirmed = outcome?.status === "error" && outcome.unconfirmed;
    if (!unconfirmed || idempotencyKey.current === null) {
      idempotencyKey.current = crypto.randomUUID();
      setOutcome(null);
    }
    setOpen(true);
  }

  async function confirm() {
    if (busy.current || idempotencyKey.current === null) return;
    busy.current = true;
    setPending(true);
    try {
      setOutcome(await joinSession({ sessionId: session.sessionId, idempotencyKey: idempotencyKey.current, roomToken }));
    } catch {
      setOutcome({ status: "error", code: "UNKNOWN_RESULT", message: "We couldn't confirm whether you joined. Please try again.", unconfirmed: true });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  const finished = outcome?.status === "committed" || outcome?.status === "waitlisted";
  const share = <Money cents={session.bookingShareCents} />;

  return (
      <Dialog open={open} onOpenChange={(next) => { if (!pending) { if (next) openDialog(); else setOpen(false); } }}>
        <DialogTrigger asChild>
          <Button type="button" className="min-h-11" aria-label={`Join ${session.sport} session at ${session.venueName}`}>
            Join
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{finished ? (outcome.status === "committed" ? "You're in" : "You're on the waitlist") : "Join this session?"}</DialogTitle>
            <DialogDescription>
              {session.sport} at {session.venueName}, <time dateTime={session.startAt}>{singaporeStart.format(new Date(session.startAt))}</time> (Singapore time).
            </DialogDescription>
          </DialogHeader>

          {outcome?.status === "committed" && (
            <p role="status"><Money cents={outcome.heldCents} className="font-semibold" /> is now held in your wallet. It goes to the booker after attendance is verified.</p>
          )}
          {outcome?.status === "waitlisted" && (
            <p role="status">The session is full, so you've joined the waitlist. Nothing is held until a place opens for you. Keep enough in your wallet to cover your share, or you'll leave the waitlist when a place opens.</p>
          )}

          {!finished && (
            <div className="space-y-3">
              <div className="rounded-lg bg-secondary p-4 text-center">
                <p className="text-sm text-muted-foreground">Held from your wallet</p>
                <Money cents={session.bookingShareCents} className="text-3xl font-bold" />
              </div>
              <InfoNote icon>
                Your share is held, not paid, until attendance is verified. If the session is already full you join the
                waitlist instead and nothing is held. Withdraw at least 30 hours before the start for a full refund; closer to start,
                you need a replacement or the share is forfeited.
              </InfoNote>
            </div>
          )}

          {outcome?.status === "error" && (
            <div className="space-y-2">
              <ErrorMessage>{outcome.message}</ErrorMessage>
              {outcome.code === "UNAUTHENTICATED" && <Button asChild variant="link" className="h-auto p-0"><Link href={loginHref}>Log in</Link></Button>}
              {outcome.code === "EMAIL_REQUIRED" && <Button asChild variant="link" className="h-auto p-0"><Link href={emailHref}>Add email</Link></Button>}
              {outcome.code === "INSUFFICIENT_FUNDS" && <Button asChild variant="link" className="h-auto p-0"><Link href="/wallet">Go to wallet</Link></Button>}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {finished ? (
              <Button type="button" className="min-h-11" onClick={() => setOpen(false)}>Done</Button>
            ) : (
              <>
                <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={() => setOpen(false)}>Not now</Button>
                <Button type="button" className="min-h-11" disabled={pending} onClick={confirm}>
                  {pending ? "Joining…" : <span>Confirm and hold {share}</span>}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}
