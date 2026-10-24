import { z } from "zod";
import { createAuthenticatedActions } from "@/app/http/authenticated-action";
import { invalidRequest } from "@/app/http/request-failure";
import { sessionCreationErrorResponse, errorResponse } from "@/app/sessions/create-session-response";
import { getVenueDependencies } from "@/app/venues/server-dependencies";
import { VenueSearchProviderError, VenueSearchUnavailableError } from "@/lib/venues/contracts";

export const runtime = "nodejs";

const actions = createAuthenticatedActions({
  getDependencies: getVenueDependencies,
  errorResponse: (error) => {
    if (error instanceof VenueSearchUnavailableError)
      return errorResponse(503, "VENUE_SEARCH_UNAVAILABLE", "Venue search is not configured. Enter the venue manually.");
    if (error instanceof VenueSearchProviderError)
      return errorResponse(502, "VENUE_SEARCH_FAILED", "Venue search is temporarily unavailable. Enter the venue manually.");
    return sessionCreationErrorResponse(error);
  },
});

export const GET = actions.get({
  parse: (_userId, _params, request) => {
    const params = new URL(request.url).searchParams;
    const query = z.string().trim().min(2).max(100).safeParse(params.get("q"));
    const page = z.coerce.number().int().min(1).max(1000).safeParse(params.get("page") ?? "1");
    if (!query.success || !page.success || params.getAll("q").length !== 1 || params.getAll("page").length > 1)
      throw invalidRequest("Enter a venue search of 2–100 characters and a valid page");
    return { query: query.data, page: page.data };
  },
  run: (dependencies, { query, page }) => dependencies.search(query, page),
});
