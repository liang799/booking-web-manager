import { createAuthenticatedActions } from "@/app/http/authenticated-action";
import { getSessionDependencies } from "./server-dependencies";
import { sessionCreationErrorResponse } from "./create-session-response";

export const sessionCreationAction = createAuthenticatedActions({
  getDependencies: getSessionDependencies,
  errorResponse: sessionCreationErrorResponse,
  successHeaders: {},
}).json;
