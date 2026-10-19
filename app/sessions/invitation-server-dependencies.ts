import { createSessionInvitationDependencies } from "@/use-case-config/invitations";
import type { SessionInvitationDependencies } from "./invitation-dependencies";

let initialization: Promise<SessionInvitationDependencies> | undefined;

export async function getSessionInvitationDependencies(): Promise<SessionInvitationDependencies> {
  initialization ??= Promise.resolve()
    .then(() => createSessionInvitationDependencies())
    .catch((error) => {
      initialization = undefined;
      throw error;
    });
  return initialization;
}
