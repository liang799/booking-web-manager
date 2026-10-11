"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { AcceptReplacement, AcceptReplacementRequest, ReplacementInvitation } from "./replacement-ports";
import { SessionActionError } from "./withdrawal-errors";
import { joinedSessionsQueryKey, replacementInvitationsQueryKey, walletQueryKey } from "./withdrawal-query-keys";
import {
  browserUnresolvedStore, keepListed, settleAttempt, unresolvedDepartureSchema, type AttemptOutcome, type UnresolvedStore,
} from "./withdrawal-recovery";

/** Everything the accept-replacement dialog shows. `closed` means no dialog. */
export type AcceptReplacementState =
  | { readonly step: "closed" }
  | {
      readonly step: "confirming";
      readonly invitation: ReplacementInvitation;
      readonly submitting: boolean;
      readonly error: string | null;
      /** The API's code for `error`, so the dialog can offer the right next step (for example a top-up). */
      readonly errorCode: string | null;
      /** An acceptance for this invitation may already have happened; only its retry can be sent. */
      readonly unresolved: boolean;
    }
  | { readonly step: "accepted"; readonly invitation: ReplacementInvitation; readonly heldCents: number };

export interface AcceptReplacementFlow {
  readonly state: AcceptReplacementState;
  readonly start: (invitation: ReplacementInvitation) => void;
  readonly confirm: () => void;
  readonly close: () => void;
}

const UNCONFIRMED_MESSAGE = "We couldn't confirm whether you took the place. Try again: the same request is reused, so your share is never held twice.";

/**
 * UC2-05 accept a replacement invitation, for one dialog shared by every invitation. React Query
 * runs the acceptance (`useMutation`) and refreshes the invitations, joined sessions and wallet;
 * this hook keeps the selected invitation and unresolved acceptances' idempotency keys, following
 * `withdrawal-recovery.ts`: per user, saved across reloads, retried exactly, and cleared only once
 * the outcome is established (the retry succeeds, or the server no longer lists the invitation).
 */
export function useAcceptReplacementFlow({ userId, invitations, acceptReplacement, store: givenStore }: {
  readonly userId: string;
  /** The server's current pending invitations, used to establish unresolved outcomes. */
  readonly invitations: readonly ReplacementInvitation[] | undefined;
  readonly acceptReplacement: AcceptReplacement;
  /** Injected in stories and tests; defaults to this browser's storage for the user. */
  readonly store?: UnresolvedStore<string>;
}): AcceptReplacementFlow {
  const queryClient = useQueryClient();
  const [store] = useState(() => givenStore ?? browserUnresolvedStore("replacement-acceptances", userId, unresolvedDepartureSchema));
  const [selected, setSelected] = useState<ReplacementInvitation | null>(null);
  const [saved, setSaved] = useState(() => store.load());
  const retrying = useRef(false);

  const listed = invitations?.map((invitation) => invitation.sessionId);
  const keys = keepListed(saved, listed);
  useEffect(() => { store.save(keys); }, [store, keys]);

  const settle = (request: AcceptReplacementRequest, outcome: AttemptOutcome) =>
    setSaved((current) => settleAttempt(keepListed(current, listed), request.sessionId, request.idempotencyKey, outcome, retrying.current));
  const refresh = (queryKeys: readonly (readonly unknown[])[]) => {
    for (const queryKey of queryKeys) void queryClient.invalidateQueries({ queryKey });
  };

  const mutation = useMutation<number, SessionActionError, AcceptReplacementRequest>({
    mutationFn: async (request) => {
      let result: Awaited<ReturnType<AcceptReplacement>>;
      try {
        result = await acceptReplacement(request);
      } catch {
        throw new SessionActionError({ status: "error", code: "UNKNOWN_RESULT", message: UNCONFIRMED_MESSAGE, unconfirmed: true });
      }
      if (result.status === "error") throw new SessionActionError(result);
      return result.heldCents;
    },
    retry: false,
    onSuccess: (_heldCents, request) => {
      settle(request, "succeeded");
      refresh([replacementInvitationsQueryKey(userId), joinedSessionsQueryKey(userId), walletQueryKey]);
    },
    onError: (error, request) => {
      settle(request, error.unconfirmed ? "unconfirmed" : "rejected");
      // A definite rejection often means the invitation changed (taken back, session closed): show the current list.
      if (!error.unconfirmed) refresh([replacementInvitationsQueryKey(userId)]);
    },
  });

  const forSelected = selected !== null && mutation.variables?.sessionId === selected.sessionId;
  let state: AcceptReplacementState;
  if (selected === null) {
    state = { step: "closed" };
  } else if (forSelected && mutation.isSuccess) {
    state = { step: "accepted", invitation: selected, heldCents: mutation.data };
  } else {
    const failed = forSelected && mutation.isError ? mutation.error : null;
    state = {
      step: "confirming", invitation: selected, submitting: mutation.isPending, unresolved: keys.has(selected.sessionId),
      error: failed?.message ?? null, errorCode: failed?.code ?? null,
    };
  }

  return {
    state,
    start: (invitation) => {
      if (mutation.isPending) return;
      mutation.reset();
      setSelected(invitation);
    },
    confirm: () => {
      if (selected === null || mutation.isPending) return;
      const savedKey = keys.get(selected.sessionId);
      retrying.current = savedKey !== undefined;
      mutation.mutate({ sessionId: selected.sessionId, idempotencyKey: savedKey ?? crypto.randomUUID() });
    },
    close: () => { if (!mutation.isPending) setSelected(null); },
  };
}
