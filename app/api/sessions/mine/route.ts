import { createAuthenticatedActions } from "@/app/http/authenticated-action";
import { parseSessionFeedInput, toSessionFeedResponse } from "@/app/sessions/session-feed-pagination";
import { getSessionFeedDependencies } from "@/app/sessions/session-feed-server-dependencies";
import { sessionVisibilityErrorResponse } from "@/app/sessions/visibility-response";

const actions = createAuthenticatedActions({
  getDependencies: getSessionFeedDependencies,
  errorResponse: sessionVisibilityErrorResponse,
});

/** Authenticated personal sessions, with database-level keyset pagination. */
export const GET = actions.get({
  parse: (userId, _params, request) => ({ userId, ...parseSessionFeedInput(request, userId) }),
  run: async (dependencies, { userId, ...input }) => ({
    page: await dependencies.sessionFeed.list(userId, input), userId, tab: input.tab,
  }),
  serialize: ({ page, userId, tab }) => toSessionFeedResponse(page, userId, tab),
});
