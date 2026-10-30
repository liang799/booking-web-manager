"use client";

import { useState, useTransition } from "react";
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
  /** The acceptGroupInvitation and declineGroupInvitation server actions. */
  readonly accept: (groupId: string) => Promise<GroupActionResult>;
  readonly decline: (groupId: string) => Promise<GroupActionResult>;
}

const sentOn = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" });

/** ADR-0022: invitations by user ID waiting for the signed-in player's answer. */
export function GroupInvitations({ invitations, accept, decline }: GroupInvitationsProps) {
  return (
    <section aria-labelledby="group-invitations-heading" className="space-y-3">
      <h2 id="group-invitations-heading" className="text-xl font-semibold">Invitations</h2>
      <ul className="divide-y rounded-lg border bg-card">
        {invitations.map((invitation) => (
          <InvitationRow key={invitation.groupId} invitation={invitation} accept={accept} decline={decline} />
        ))}
      </ul>
    </section>
  );
}

function InvitationRow({
  invitation,
  accept,
  decline,
}: {
  readonly invitation: GroupInvitationView;
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
    <li className="flex flex-wrap items-center gap-3 p-4">
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
