import { createAuthenticatedActions } from "@/app/http/authenticated-action";
import { getPlayerSessionsDependencies } from "./player-sessions-server-dependencies";
import { withdrawalPreviewErrorResponse } from "./withdrawal-preview-response";

const actions = createAuthenticatedActions({
  getDependencies: getPlayerSessionsDependencies,
  // Same policy as the preview: 401 signed out, 503 unconfigured, opaque 500 otherwise.
  errorResponse: withdrawalPreviewErrorResponse,
});

/** Authenticated, uncached GET policy for the player's own lists. */
export const playerSessionsGetAction = actions.get;
