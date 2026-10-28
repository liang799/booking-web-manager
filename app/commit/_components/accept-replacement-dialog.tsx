"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorMessage } from "@/components/ui/error-message";
import { InfoNote } from "@/components/ui/info-note";
import { Money } from "@/components/ui/money";
import type { AcceptReplacementState } from "../use-accept-replacement-flow";
import { singaporeStart } from "./joined-session-format";

/**
 * UC2-05 accept a replacement invitation, display only: one controlled dialog for the whole list,
 * driven by `useAcceptReplacementFlow`. Shows the share that will be held before anything happens.
 */
export function AcceptReplacementDialog({ state, onConfirm, onClose }: {
  readonly state: AcceptReplacementState;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}) {
  if (state.step === "closed") return <Dialog open={false} />;
  const { invitation } = state;
  const submitting = state.step === "confirming" && state.submitting;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{state.step === "accepted" ? "The place is yours" : "Take this place?"}</DialogTitle>
          <DialogDescription>
            {invitation.sport} at {invitation.venueName}, <time dateTime={invitation.startAt}>{singaporeStart.format(new Date(invitation.startAt))}</time> (Singapore time).
          </DialogDescription>
        </DialogHeader>

        {state.step === "confirming" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-secondary p-4 text-center">
              <p className="text-sm text-muted-foreground">Held from your wallet</p>
              <Money cents={invitation.bookingShareCents} className="text-3xl font-bold" />
            </div>
            <InfoNote icon>
              It stays held until attendance is verified, then goes to the booker. If you withdraw later, the usual
              refund rules apply: a full refund at least 30 hours before the start.
            </InfoNote>
            {state.error !== null && (
              <ErrorMessage>
                {state.error}
                {state.errorCode === "INSUFFICIENT_FUNDS" && (
                  <> <Link href="/wallet" className="font-medium underline underline-offset-4">Top up your wallet</Link></>
                )}
              </ErrorMessage>
            )}
            {state.unresolved && state.error === null && (
              <ErrorMessage>
                Your last request to take this place wasn&apos;t confirmed. Retry it to finish; the same request is reused, so your share is never held twice.
              </ErrorMessage>
            )}
          </div>
        )}

        {state.step === "accepted" && (
          <p role="status">
            <Money cents={state.heldCents} className="font-semibold" /> is now held from your wallet. You&apos;ll find the session with the others you&apos;ve joined.
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {state.step === "accepted" ? (
            <Button type="button" className="min-h-11" onClick={onClose}>Done</Button>
          ) : (
            <>
              {/* After an unresolved request the place may already be taken, so don't say "not now". */}
              <Button type="button" variant="outline" className="min-h-11" disabled={submitting} onClick={onClose}>
                {state.unresolved ? "Retry later" : "Not now"}
              </Button>
              <Button type="button" className="min-h-11" disabled={submitting} onClick={onConfirm}>
                {submitting ? "Accepting…" : state.unresolved ? "Retry accepting" : "Accept and hold"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
