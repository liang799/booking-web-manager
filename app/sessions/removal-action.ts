import { createAuthenticatedActions } from "@/app/http/authenticated-action";
import { getSessionRemovalDependencies } from "./removal-server-dependencies";
import { participantRemovalErrorResponse } from "./removal-response";

const actions = createAuthenticatedActions({
  getDependencies: getSessionRemovalDependencies,
  errorResponse: participantRemovalErrorResponse,
});

/** Shares participant-removal authentication and conflict handling across its routes. */
export const participantRemovalAction = actions.json;
export const participantRemovalGetAction = actions.get;
