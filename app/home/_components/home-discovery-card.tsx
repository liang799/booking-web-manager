"use client";

import Image from "next/image";
import { JoinSessionButton } from "@/app/commit/_components/join-session-button";
import type { JoinSession } from "@/app/commit/join-session-transport";
import type { DiscoverySession } from "@/app/discover/contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Money } from "@/components/ui/money";
import { sportImage } from "@/lib/sessions/sport-image";

const date = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "long" });
const time = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "numeric", minute: "2-digit" });

function SessionTime({ session }: { readonly session: DiscoverySession }) {
  const start = new Date(session.startAt);
  const end = new Date(session.endAt);
  const sameDay = date.format(start) === date.format(end);
  return <p className="text-sm leading-relaxed text-muted-foreground">
    <time dateTime={session.startAt}>{time.format(start)}</time> – <time dateTime={session.endAt}>{!sameDay && `${date.format(end)}, `}{time.format(end)}</time> SGT
  </p>;
}

/** Public summary only; the existing join dialog still confirms the wallet hold. */
export function HomeDiscoveryCard({ session, joinSession }: { readonly session: DiscoverySession; readonly joinSession: JoinSession }) {
  return <li>
    <article aria-label={`${session.sport} session at ${session.venueName}`} className="overflow-hidden rounded-lg border bg-card">
      <div className="relative aspect-[16/9] overflow-hidden bg-muted">
        <Image src={sportImage(session.sport)} alt="" fill sizes="(max-width: 767px) calc(100vw - 48px), 1px" className="object-cover" />
      </div>
      <div className="p-5">
        <h3 className="text-base font-semibold leading-snug"><time dateTime={session.startAt} title={date.format(new Date(session.startAt))}>{shortDate.format(new Date(session.startAt))}</time> {session.sport} Booking</h3>
        <p className="mt-3 break-words text-sm text-muted-foreground">{session.venueName}</p>
        <SessionTime session={session} />
        <p className="mt-3 flex flex-wrap items-baseline gap-1.5"><Money cents={session.bookingShareCents} className="text-2xl font-semibold tracking-tight" /><span className="text-xs text-muted-foreground">per person</span></p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <JoinSessionButton session={session} joinSession={joinSession} triggerLabel="Join now" loginHref="/login?next=%2F" />
          <Dialog>
            <DialogTrigger asChild><Button variant="ghost" className="min-h-11">View booking<span className="sr-only">: {session.sport} at {session.venueName}</span></Button></DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{session.sport} booking</DialogTitle>
                <DialogDescription>{session.venueName} · {session.region}</DialogDescription>
              </DialogHeader>
              <p className="font-medium"><time dateTime={session.startAt}>{date.format(new Date(session.startAt))}</time></p>
              <SessionTime session={session} />
              <dl className="grid grid-cols-2 gap-4 rounded-lg bg-muted p-4 text-sm">
                <div><dt className="text-muted-foreground">Share per person</dt><dd className="mt-1 font-medium"><Money cents={session.bookingShareCents} /></dd></div>
                <div><dt className="text-muted-foreground">Total capacity</dt><dd className="mt-1 font-medium">{session.totalSlots} players</dd></div>
              </dl>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </article>
  </li>;
}
