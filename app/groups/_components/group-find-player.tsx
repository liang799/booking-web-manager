"use client";

import { FindPlayer } from "@/app/users/_components/find-player";
import type { FindPlayerState } from "@/app/users/find-player-action";
import type { InvitePlayerState } from "../actions";
import { InvitePlayer, type InviteGroupOption } from "./invite-player";

interface GroupFindPlayerProps {
  /** The findPlayer server action. */
  readonly findAction: (previous: FindPlayerState, formData: FormData) => Promise<FindPlayerState>;
  /** The invitePlayer server action. */
  readonly inviteAction: (previous: InvitePlayerState, formData: FormData) => Promise<InvitePlayerState>;
  readonly inviteGroups: readonly InviteGroupOption[];
}

/** Find a player on the Groups page, with Invite beside a found player who isn't you (ADR-0021/0022). */
export function GroupFindPlayer({ findAction, inviteAction, inviteGroups }: GroupFindPlayerProps) {
  return (
    <FindPlayer
      action={findAction}
      playerAction={(player) => <InvitePlayer player={player} groups={inviteGroups} action={inviteAction} />}
    />
  );
}
