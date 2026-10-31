"use client";

import { useActionState, useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import styles from "./group-detail.module.css";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorMessage } from "@/components/ui/error-message";
import { InfoNote } from "@/components/ui/info-note";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  archiveGroup,
  cancelPendingInvitation,
  createGroup,
  joinGroup,
  leaveGroup,
  removeMember,
  renameGroup,
  revokeInvitation,
  rotateInvitation,
  type GroupActionResult,
  type GroupFormState,
} from "../actions";

const idle: GroupFormState = { status: "idle" };

/** The "name + button" form used to create and to rename a group. */
function GroupNameForm({
  action,
  label,
  submitLabel,
  pendingLabel,
  defaultValue = "",
}: {
  readonly action: (previous: GroupFormState, formData: FormData) => Promise<GroupFormState>;
  readonly label: string;
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly defaultValue?: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [, startTransition] = useTransition();

  // Submit without React's automatic reset, so the typed name stays after an error.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const hasError = state.status === "error" && state.message !== undefined;
  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-2">
      <Label htmlFor="group-name">{label}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="group-name"
          name="name"
          defaultValue={defaultValue}
          placeholder="e.g. Weekend Tennis Crew"
          maxLength={60}
          aria-invalid={hasError}
          aria-describedby={hasError ? "group-name-error" : undefined}
        />
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
      {hasError && (
        <p id="group-name-error" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      {state.status === "saved" && <p role="status" className="text-sm text-success">{state.message}</p>}
    </form>
  );
}

/** UC1-06: create a new group (Groups page). */
export function CreateGroupForm() {
  return (
    <GroupNameForm action={createGroup} label="New group name" submitLabel="Create group" pendingLabel="Creating…" />
  );
}

/** UC1-06: owner renames the group. */
export function RenameGroupForm({ groupId, name }: { readonly groupId: string; readonly name: string }) {
  return (
    <GroupNameForm
      action={renameGroup.bind(null, groupId)}
      label="Group name"
      submitLabel="Save changes"
      pendingLabel="Saving…"
      defaultValue={name}
    />
  );
}

export { InvitationLink } from "./invitation-link";

/** A plain button that runs one group action and shows any refusal under it. */
function ActionButton({
  run,
  label,
  pendingLabel,
  variant = "outline",
}: {
  readonly run: () => Promise<GroupActionResult>;
  readonly label: string;
  readonly pendingLabel: string;
  readonly variant?: "outline" | "destructive" | "default";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await run();
            if (result?.error !== undefined) setError(result.error);
          })
        }
      >
        {pending ? pendingLabel : label}
      </Button>
      {error !== null && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}

/** Owner: issue a new link, or turn the link off. */
export function InvitationControls({ groupId, active }: { readonly groupId: string; readonly active: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton
        run={() => rotateInvitation(groupId)}
        label={active ? "Make a new link" : "Turn link on (new link)"}
        pendingLabel="Making link…"
      />
      {active && (
        <ActionButton run={() => revokeInvitation(groupId)} label="Turn link off" pendingLabel="Turning off…" />
      )}
    </div>
  );
}

/** Owner: remove one member, after a confirmation. */
export function RemoveMemberButton({
  groupId,
  memberId,
  memberName,
}: {
  readonly groupId: string;
  readonly memberId: string;
  readonly memberName: string;
}) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon" className={styles.rowAction} aria-label={"Remove " + memberName} title={"Remove " + memberName}>
          <MoreHorizontal size={22} aria-hidden="true" />
        </Button>
      }
      title={`Remove ${memberName}?`}
      description="They leave this group and can only rejoin with a current invitation link."
      confirmLabel="Remove member"
      destructive
      onConfirm={async () => {
        const result = await removeMember(groupId, memberId);
        if (result.error !== undefined) throw new Error(result.error);
      }}
    />
  );
}

/** Owner: withdraw one unanswered invitation from the Pending invitations list. */
export function CancelPendingInvitationButton({ groupId, inviteeId, inviteeName }: {
  readonly groupId: string;
  readonly inviteeId: string;
  readonly inviteeName: string;
}) {
  return (
    <ConfirmDialog
      trigger={<Button variant="ghost" size="icon" className={styles.rowAction} aria-label={"Revoke invitation for " + inviteeName} title={"Revoke invitation for " + inviteeName}><MoreHorizontal size={22} aria-hidden="true" /></Button>}
      title={"Revoke " + inviteeName + "'s invitation?"}
      description="They will no longer be able to accept this invitation. The group link stays active."
      confirmLabel="Revoke invitation"
      destructive
      onConfirm={async () => {
        const result = await cancelPendingInvitation(groupId, inviteeId);
        if (result.error !== undefined) throw new Error(result.error);
      }}
    />
  );
}

/** Owner: archive the group, after a confirmation. */
export function ArchiveGroupButton({ groupId }: { readonly groupId: string }) {
  return (
    <ConfirmDialog
      trigger={<Button variant="outline">Archive group</Button>}
      title="Archive this group?"
      description="The invitation link is turned off and the group can no longer be changed. Members keep their history."
      confirmLabel="Archive group"
      destructive
      onConfirm={async () => {
        const result = await archiveGroup(groupId);
        if (result.error !== undefined) throw new Error(result.error);
      }}
    />
  );
}

/** Member (not the owner): leave the group, after a confirmation. On success the server opens the group list. */
export function LeaveGroupButton({ groupId, groupName }: { readonly groupId: string; readonly groupName: string }) {
  return (
    <ConfirmDialog
      trigger={<Button variant="outline">Leave group</Button>}
      title={`Leave ${groupName}?`}
      description="You'll no longer see this group or sessions shared only with it. Sessions you've already joined stay as they are. To rejoin, you'll need a current invitation link."
      confirmLabel="Leave group"
      destructive
      onConfirm={async () => {
        // A successful leave redirects, so there may be no result to read.
        const result = await leaveGroup(groupId);
        if (result?.error !== undefined) throw new Error(result.error);
      }}
    />
  );
}

/** Join page: the "Join group" button. On success the server opens the group page. */
export function JoinGroupButton({ token, groupName }: { readonly token: string; readonly groupName: string }) {
  return (
    <div className="space-y-3">
      <InfoNote>You can leave the group at any time from its page.</InfoNote>
      <ActionButton run={() => joinGroup(token)} label={`Join ${groupName}`} pendingLabel="Joining…" variant="default" />
    </div>
  );
}
