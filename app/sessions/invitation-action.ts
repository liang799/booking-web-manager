import { createAuthenticatedActions } from "@/app/http/authenticated-action";
import { getSessionInvitationDependencies } from "./invitation-server-dependencies";
import { sessionVisibilityErrorResponse } from "./visibility-response";

export const sessionInvitationGetAction = createAuthenticatedActions({
  getDependencies: getSessionInvitationDependencies,
  errorResponse: sessionVisibilityErrorResponse,
}).get;
