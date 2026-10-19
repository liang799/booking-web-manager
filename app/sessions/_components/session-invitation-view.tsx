"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { JoinSessionButton } from "@/app/commit/_components/join-session-button";
import type { InvitationScreen } from "../invitation-screen";

const singaporeDateTime = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore", weekday: "short", day: "numeric", month: "short", year: "numeric",
  hour: "numeric", minute: "2-digit",
});

/** A small public preview; the existing commitment flow owns confirmation and money movement. */
export function SessionInvitationView({ outcome }: { readonly outcome: InvitationScreen }) {
  const router = useRouter();
  if (outcome.status !== "ready") return <div className="mx-auto max-w-xl px-6 py-12 md:py-20">
    <h1 className="text-2xl font-bold tracking-tight">{outcome.status === "unavailable" ? "Invitation unavailable" : "We couldn’t load this invitation"}</h1>
    <p className="mt-4 leading-relaxed text-muted-foreground">{outcome.status === "unavailable"
      ? "This invitation is not valid or the session is no longer accepting players."
      : "Please try again in a moment."}</p>
    <div className="mt-6 flex flex-wrap gap-3">
      {outcome.status === "error" && <Button onClick={() => router.refresh()}>Retry</Button>}
      <Button asChild variant="outline"><Link href="/discover">Discover sessions</Link></Button>
    </div>
  </div>;

  const { session, invitationPath, roomToken, viewerId } = outcome;
  const next = new URLSearchParams({ next: invitationPath }).toString();
  return <div className="mx-auto max-w-2xl px-6 py-8 md:py-14">
    <p className="text-sm font-semibold uppercase tracking-widest text-primary">You’re invited</p>
    <h1 className="mt-3 break-words text-3xl font-bold tracking-tight md:text-4xl">{session.venueName}</h1>
    <p className="mt-3 text-lg text-muted-foreground">{session.sport} · {session.region}</p>
    <div className="mt-8 rounded-2xl border bg-card p-5 shadow-sm md:p-8">
      <dl className="space-y-5">
        <div className="relative pl-8">
          <dt className="text-sm text-muted-foreground"><CalendarDays className="absolute left-0 top-0.5 h-5 w-5 text-muted-foreground" aria-hidden="true" />When · Singapore time</dt>
            <dd className="mt-1 leading-relaxed"><time dateTime={session.startAt}>{singaporeDateTime.format(new Date(session.startAt))}</time><br />
              to <time dateTime={session.endAt}>{singaporeDateTime.format(new Date(session.endAt))}</time></dd>
        </div>
        <div className="relative pl-8">
          <dt className="text-sm text-muted-foreground"><MapPin className="absolute left-0 top-0.5 h-5 w-5 text-muted-foreground" aria-hidden="true" />Venue</dt><dd className="mt-1 break-words">{session.venueName}</dd>
        </div>
        <div className="relative pl-8">
          <dt className="text-sm text-muted-foreground"><Users className="absolute left-0 top-0.5 h-5 w-5 text-muted-foreground" aria-hidden="true" />Total places</dt><dd className="mt-1">{session.totalSlots} players</dd>
        </div>
      </dl>
      <div className="mt-6 border-t pt-6">
        <p className="text-sm text-muted-foreground">Your booking share</p>
        <Money cents={session.bookingShareCents} className="mt-1 block text-3xl font-bold" />
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">You’ll review and confirm your share before it is held in your wallet. If the session is full, you can join the waitlist.</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {viewerId === null ? <>
            <Button asChild className="min-h-11"><Link href={`/login?${next}`}>Log in to join</Link></Button>
            <Button asChild variant="outline" className="min-h-11"><Link href={`/register?${next}`}>Create account</Link></Button>
          </> : <JoinSessionButton key={`${viewerId}:${session.sessionId}:${roomToken}`} session={session} roomToken={roomToken} loginHref={`/login?${next}`} emailHref={`/profile/email?${next}`} />}
        </div>
      </div>
    </div>
  </div>;
}
