"use client";

import { useMutation } from "@tanstack/react-query";
import type { FindReplacementCandidate, ReplacementCandidate } from "./withdrawal-ports";

/** What the "Invite one person" search shows. */
export type ReplacementSearchState =
  | { readonly status: "idle" }
  | { readonly status: "searching"; readonly handle: string }
  | { readonly status: "found"; readonly candidate: ReplacementCandidate }
  | { readonly status: "not-found"; readonly handle: string }
  /** The player looked up their own user ID; they can't name themselves (ADR-0006). */
  | { readonly status: "self" }
  | { readonly status: "error"; readonly message: string };

export interface ReplacementSearch {
  readonly state: ReplacementSearchState;
  /** Looks up an already-normalised user ID (no "@", lower case). */
  readonly search: (handle: string) => void;
  /** Forgets the last search, e.g. when another session's dialog opens. */
  readonly reset: () => void;
}

/**
 * UC2-05 "Invite one person": finds the replacement by exact user ID (ADR-0021) and names the
 * found player as the withdrawal's invitee through `onChoose`. Each new search first clears the
 * invitee, so a withdrawal can only name the player currently shown. React Query runs the lookup.
 */
export function useReplacementSearch({ userId, findCandidate, onChoose }: {
  /** The signed-in player, who can't name themselves. */
  readonly userId: string;
  readonly findCandidate: FindReplacementCandidate;
  readonly onChoose: (inviteeId: string | null) => void;
}): ReplacementSearch {
  const lookup = useMutation({ mutationFn: (handle: string) => findCandidate(handle), retry: false });

  let state: ReplacementSearchState = { status: "idle" };
  if (lookup.isPending && lookup.variables !== undefined) state = { status: "searching", handle: lookup.variables };
  else if (lookup.isError) state = { status: "error", message: "We couldn't look up that user ID. Please try again." };
  else if (lookup.data?.status === "found") {
    state = lookup.data.candidate.userId === userId ? { status: "self" } : { status: "found", candidate: lookup.data.candidate };
  } else if (lookup.data?.status === "not-found" && lookup.variables !== undefined) state = { status: "not-found", handle: lookup.variables };
  else if (lookup.data?.status === "error") state = { status: "error", message: lookup.data.message };

  return {
    state,
    search: (handle) => {
      onChoose(null);
      // Callbacks passed to mutate run only for the latest search, so a slower earlier answer
      // never names someone the player has already searched past.
      lookup.mutate(handle, {
        onSuccess: (result) => {
          if (result.status === "found" && result.candidate.userId !== userId) onChoose(result.candidate.userId);
        },
      });
    },
    reset: () => lookup.reset(),
  };
}
