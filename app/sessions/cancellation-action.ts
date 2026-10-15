import { createAuthenticatedActions } from "@/app/http/authenticated-action";
import { getSessionCancellationDependencies } from "./cancellation-server-dependencies";
import { sessionCancellationErrorResponse } from "./cancellation-response";

const actions = createAuthenticatedActions({
  getDependencies: getSessionCancellationDependencies,
  errorResponse: sessionCancellationErrorResponse,
});

/** Keeps cancellation conflict handling consistent across previews and submissions. */
export const sessionCancellationAction = actions.json;
export const sessionCancellationGetAction = actions.get;
