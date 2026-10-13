import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorMessage } from "@/components/ui/error-message";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Money } from "@/components/ui/money";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ReplacementInvitation } from "../replacement-ports";
import { singaporeStart } from "./joined-session-format";

/** The invitations, still loading, loaded, or failed. */
export type ReplacementInvitationsState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly invitations: readonly ReplacementInvitation[] }
  | { readonly status: "error"; readonly message: string };

export interface ReplacementInvitationsViewProps {
  readonly state: ReplacementInvitationsState;
  readonly onRetry: () => void;
  /** Opens the (single) accept dialog for this invitation. */
  readonly onAccept: (invitation: ReplacementInvitation) => void;
}

/**
 * UC2-05: places other players reserved for this player when they withdrew (ADR-0006).
 * Presentational: it shows the invitations it is given and reports which one the player wants
 * to accept. Each shows the share that accepting would hold.
 */
export function ReplacementInvitationsView({ state, onRetry, onAccept }: ReplacementInvitationsViewProps) {
  return (
    <section aria-labelledby="invitations-heading" className="mx-auto w-full max-w-3xl px-6 pb-10 pt-6 md:px-8 md:pt-10">
      <header className="mb-6">
        <h1 id="invitations-heading" className="text-2xl font-bold tracking-tight md:text-3xl">Places reserved for you</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Someone who withdrew chose you to take their place. Only you can take it, and only once you accept.
        </p>
      </header>

      {state.status === "loading" && <LoadingSpinner label="Loading your invitations…" />}
      {state.status === "error" && (
        <div className="space-y-3">
          <ErrorMessage>{state.message}</ErrorMessage>
          <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>Retry</Button>
        </div>
      )}
      {state.status === "ready" && state.invitations.length === 0 && (
        <EmptyState title="No places reserved for you" description="When someone invites you to take their place, it appears here." />
      )}
      {state.status === "ready" && state.invitations.length > 0 && (
        <ul aria-label="Replacement invitations" className="space-y-3">
          {state.invitations.map((invitation) => (
            <li key={invitation.sessionId} className="rounded-lg border bg-card p-4 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="break-words text-lg font-semibold">{invitation.venueName}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {invitation.sport} · {invitation.region} · <time dateTime={invitation.startAt}>{singaporeStart.format(new Date(invitation.startAt))}</time> SGT
                  </p>
                </div>
                <StatusBadge tone="info">Reserved for you</StatusBadge>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  <Money cents={invitation.bookingShareCents} className="font-semibold text-foreground" /> will be held from your wallet
                </p>
                <Button type="button" className="min-h-11" onClick={() => onAccept(invitation)}
                  aria-label={`Accept the place in ${invitation.sport} at ${invitation.venueName}`}>Accept</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
