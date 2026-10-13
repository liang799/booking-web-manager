import { createAuthenticatedActions } from "@/app/http/authenticated-action";
import { getSessionManagementDependencies } from "./management-server-dependencies";
import { sessionVisibilityErrorResponse } from "./visibility-response";

const actions = createAuthenticatedActions({
  getDependencies: getSessionManagementDependencies,
  errorResponse: sessionVisibilityErrorResponse,
});

/** Shared authenticated HTTP policy for session-management writes and reads. */
export const sessionManagementAction = actions.json;
export const sessionManagementGetAction = actions.get;
