"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { previewParticipantRemoval, removeParticipant, type SessionParticipantsOutcome } from "../removal-actions";
import type { ImportGroup } from "./session-participants-invitations";
import { SessionParticipantsView } from "./session-participants-view";

/** Keeps each host/session recovery state isolated while server refreshes update the participant list. */
export function SessionParticipantsController({ sessionId, userId, outcome, groups }: {
  readonly sessionId: string;
  readonly userId: string;
  readonly outcome: SessionParticipantsOutcome;
  readonly groups: readonly ImportGroup[];
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  return <SessionParticipantsView key={`${userId}:${sessionId}`} sessionId={sessionId} outcome={outcome} groups={groups}
    refreshing={refreshing} removal={{ userId, preview: previewParticipantRemoval, remove: removeParticipant }}
    onRefresh={() => startTransition(() => router.refresh())} />;
}
