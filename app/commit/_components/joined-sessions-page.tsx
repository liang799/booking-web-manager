"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { loadReplacementInvitations, acceptReplacement } from "../replacement-transport";
import { useAcceptReplacementFlow } from "../use-accept-replacement-flow";
import { useLeaveWaitlistFlow } from "../use-leave-waitlist-flow";
import { useReplacementSearch } from "../use-replacement-search";
import { useWithdrawalFlow } from "../use-withdrawal-flow";
import { joinedSessionsQueryKey, replacementInvitationsQueryKey } from "../withdrawal-query-keys";
import {
  findReplacementCandidate, leaveWaitlist, loadJoinedSessions, previewWithdrawal, withdrawFromSession,
} from "../withdrawal-transport";
import { AcceptReplacementDialog } from "./accept-replacement-dialog";
import { JoinedSessionsView, type JoinedSessionsState } from "./joined-sessions-view";
import { LeaveWaitlistDialog } from "./leave-waitlist-dialog";
import { ReplacementInvitationsView, type ReplacementInvitationsState } from "./replacement-invitations-view";
import { WithdrawalDialog } from "./withdrawal-dialog";

/**
 * UC2-05 composition root for /sessions/joined: React Query loads the player's invitations and
 * joined sessions through the real transports, the flow hooks hold the interaction state (and
 * refresh both lists and the wallet after an action), and the presentational views and dialogs
 * display it. Unresolved requests are kept in this browser's storage for the user.
 */
export function JoinedSessionsPage({ userId }: { readonly userId: string }) {
  const focusedSessionId = useSearchParams().get("invitation") ?? undefined;
  const sessions = useQuery({ queryKey: joinedSessionsQueryKey(userId), queryFn: loadJoinedSessions });
  const invitations = useQuery({ queryKey: replacementInvitationsQueryKey(userId), queryFn: loadReplacementInvitations });

  const withdrawal = useWithdrawalFlow({ userId, sessions: sessions.data, previewWithdrawal, withdraw: withdrawFromSession });
  // "Invite one person" names the player found by user ID (ADR-0021).
  const inviteSearch = useReplacementSearch({ userId, findCandidate: findReplacementCandidate, onChoose: withdrawal.chooseInvitee });
  const leaving = useLeaveWaitlistFlow({ userId, sessions: sessions.data, leaveWaitlist });
  const accepting = useAcceptReplacementFlow({ userId, invitations: invitations.data, acceptReplacement });

  const sessionsState: JoinedSessionsState = sessions.isPending ? { status: "loading" }
    : sessions.isError ? { status: "error", message: sessions.error.message }
    : { status: "ready", sessions: sessions.data };
  const invitationsState: ReplacementInvitationsState = invitations.isPending ? { status: "loading" }
    : invitations.isError ? { status: "error", message: invitations.error.message }
    : { status: "ready", invitations: invitations.data };
  // Most players have no invitations: show the section only when there is one, or it failed to load.
  const showInvitations = Boolean(focusedSessionId) || invitationsState.status === "error"
    || (invitationsState.status === "ready" && invitationsState.invitations.length > 0);

  return (
    <>
      {showInvitations && (
        <ReplacementInvitationsView focusedSessionId={focusedSessionId} state={invitationsState} onRetry={() => { void invitations.refetch(); }} onAccept={accepting.start} />
      )}
      <JoinedSessionsView state={sessionsState} onRetry={() => { void sessions.refetch(); }}
        onWithdraw={(session) => { inviteSearch.reset(); withdrawal.start(session); }} onLeaveWaitlist={leaving.start} />
      <AcceptReplacementDialog state={accepting.state} onConfirm={accepting.confirm} onClose={accepting.close} />
      <WithdrawalDialog state={withdrawal.state} inviteSearch={inviteSearch.state} onSearchInvitee={inviteSearch.search}
        onChooseMode={withdrawal.chooseMode} onConfirm={withdrawal.confirm} onRetryPreview={withdrawal.retryPreview} onClose={withdrawal.close} />
      <LeaveWaitlistDialog state={leaving.state} onConfirm={leaving.confirm} onClose={leaving.close} />
    </>
  );
}
