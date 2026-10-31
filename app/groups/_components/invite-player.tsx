"use client";

import { UserPlus } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ErrorMessage } from "@/components/ui/error-message";
import type { FoundPlayer } from "@/app/users/find-player-action";
import type { InvitePlayerState } from "../actions";

/** A group the searcher may invite to: active, with its invitation link on. */
export interface InviteGroupOption {
  readonly groupId: string;
  readonly name: string;
}

interface InvitePlayerProps {
  readonly player: FoundPlayer;
  readonly groups: readonly InviteGroupOption[];
  /** The invitePlayer server action; Storybook passes a stand-in. */
  readonly action: (previous: InvitePlayerState, formData: FormData) => Promise<InvitePlayerState>;
}

/** ADR-0022: invite a player found by user ID to one of the searcher's groups. */
export function InvitePlayer({ player, groups, action }: InvitePlayerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" className="min-h-11 gap-2" aria-label={`Invite ${player.displayName}`}>
          <UserPlus aria-hidden="true" focusable="false" />
          Invite
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-32px)] max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle>Invite {player.displayName}</DialogTitle>
          <DialogDescription>
            @{player.handle} joins after accepting. They&apos;ll see the invitation on their Groups page.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so each opening starts without the last result. */}
        {open && <InviteForm player={player} groups={groups} action={action} />}
      </DialogContent>
    </Dialog>
  );
}

const idle: InvitePlayerState = { status: "idle" };

function InviteForm({ player, groups, action }: InvitePlayerProps) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [, startTransition] = useTransition();

  // Submit without React's automatic reset, so the chosen group stays selected.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  if (groups.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          You can invite players to a group whose invitation link is on. Create a group first, or turn its link on.
        </p>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11 w-full">Close</Button>
        </DialogClose>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={handleSubmit} noValidate className="space-y-4">
      <input type="hidden" name="handle" value={player.handle} />
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Group</legend>
        {groups.map((group, index) => (
          <label key={group.groupId} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 has-[:checked]:border-primary">
            <input type="radio" name="groupId" value={group.groupId} defaultChecked={index === 0} className="h-4 w-4 shrink-0 accent-primary" />
            <span className="min-w-0 break-words text-sm">{group.name}</span>
          </label>
        ))}
      </fieldset>

      <div aria-live="polite">
        {state.status === "sent" && <p role="status" className="text-sm">{state.message}</p>}
        {state.status === "error" && state.message !== undefined && <ErrorMessage>{state.message}</ErrorMessage>}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11">{state.status === "sent" ? "Done" : "Cancel"}</Button>
        </DialogClose>
        <Button type="submit" className="min-h-11" disabled={pending}>
          {pending ? "Sending…" : "Send invitation"}
        </Button>
      </div>
    </form>
  );
}
