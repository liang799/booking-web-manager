"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import type { GroupActionResult } from "../actions";

/** One unanswered invitation, as display data only (no user UUIDs). */
export interface GroupInvitationView {
  readonly groupId: string;
  readonly groupName: string;
  readonly inviterName: string;
  /** The inviter's user ID without "@"; null when their account was deleted. */
  readonly inviterHandle: string | null;
  /** ISO timestamp. */
  readonly invitedAt: string;
}

interface GroupInvitationsProps {
  readonly invitations: readonly GroupInvitationView[];
  readonly focusedGroupId?: string;
  /** The acceptGroupInvitation and declineGroupInvitation server actions. */
  readonly accept: (groupId: string) => Promise<GroupActionResult>;
  readonly decline: (groupId: string) => Promise<GroupActionResult>;
}

const sentOn = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" });

/** ADR-0022: invitations by user ID waiting for the signed-in player's answer. */
export function GroupInvitations({ invitations, accept, decline, focusedGroupId }: GroupInvitationsProps) {
  useEffect(() => { if (focusedGroupId) document.getElementById(`group-invitation-${focusedGroupId}`)?.focus(); }, [focusedGroupId]);
  return (
    <section aria-labelledby="group-invitations-heading" className="space-y-3">
      <h2 id="group-invitations-heading" className="text-xl font-semibold">Invitations</h2>
      {focusedGroupId && !invitations.some(item => item.groupId === focusedGroupId) && <p role="status">This invitation is no longer available.</p>}
      <ul className="divide-y rounded-lg border bg-card">
        {invitations.map((invitation) => (
          <InvitationRow key={invitation.groupId} invitation={invitation} highlighted={invitation.groupId === focusedGroupId} accept={accept} decline={decline} />
        ))}
      </ul>
    </section>
  );
}

function InvitationRow({
  invitation,
  highlighted,
  accept,
  decline,
}: {
  readonly invitation: GroupInvitationView;
  readonly highlighted?: boolean;
  readonly accept: GroupInvitationsProps["accept"];
  readonly decline: GroupInvitationsProps["decline"];
}) {
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function answer(choice: "accept" | "decline") {
    startTransition(async () => {
      setError(null);
      setRunning(choice);
      const result = await (choice === "accept" ? accept : decline)(invitation.groupId);
      if (result?.error !== undefined) setError(result.error);
      setRunning(null);
    });
  }

  return (
    <li id={`group-invitation-${invitation.groupId}`} tabIndex={-1} className={`flex flex-wrap items-center gap-3 p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${highlighted ? "ring-2 ring-ring" : ""}`}>
      <div className="min-w-0 flex-1 basis-56">
        <p className="break-words">
          <span className="font-semibold">{invitation.inviterName}</span>
          {invitation.inviterHandle !== null && <span className="text-muted-foreground"> @{invitation.inviterHandle}</span>}
          {" invited you to "}
          <span className="font-semibold">{invitation.groupName}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Sent <time dateTime={invitation.invitedAt}>{sentOn.format(new Date(invitation.invitedAt))}</time>
        </p>
        {error !== null && <ErrorMessage className="mt-2">{error}</ErrorMessage>}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          aria-label={`Decline the invitation to ${invitation.groupName}`}
          onClick={() => answer("decline")}
        >
          {running === "decline" ? "Declining…" : "Decline"}
        </Button>
        <Button
          type="button"
          className="min-h-11"
          disabled={pending}
          aria-label={`Join ${invitation.groupName}`}
          onClick={() => answer("accept")}
        >
          {running === "accept" ? "Joining…" : "Join"}
        </Button>
      </div>
    </li>
  );
}
