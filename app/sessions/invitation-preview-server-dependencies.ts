import { createSessionInvitationPreviewDependencies } from "@/use-case-config/invitation-preview";
import type { GetInvitedSession } from "@/use-cases/sessions/GetInvitedSession";

export interface SessionInvitationPreviewDependencies {
  readonly preview: GetInvitedSession;
}

let initialization: Promise<SessionInvitationPreviewDependencies> | undefined;

/** Public previews need only a token-bound database reader, never authentication or account hydration. */
export async function getSessionInvitationPreviewDependencies(): Promise<SessionInvitationPreviewDependencies> {
  initialization ??= Promise.resolve()
    .then(() => createSessionInvitationPreviewDependencies())
    .catch((error) => {
      initialization = undefined;
      throw error;
    });
  return initialization;
}
