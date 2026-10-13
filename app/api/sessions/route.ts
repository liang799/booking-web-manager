import { readCreateSessionRequest } from "@/app/sessions/create-session-input";
import { sessionCreationErrorResponse } from "@/app/sessions/create-session-response";
import { getSessionDependencies } from "@/app/sessions/server-dependencies";
import { getDiscoveryDependencies } from "@/app/discover/server-dependencies";
import { readDiscoveryRequest } from "@/app/discover/request";
import { toDiscoveryPage } from "@/app/discover/contracts";
import {
  discoveryErrorResponse,
  discoveryJson,
  type DiscoveryFailureStage,
} from "@/app/discover/response";
import { loadDependencies } from "@/app/http/load-dependencies";
import { requireUserId } from "@/app/http/require-user-id";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  let stage: DiscoveryFailureStage = "initialization";
  try {
    const dependencies = await loadDependencies(getDiscoveryDependencies);
    stage = "validation";
    const { criteria, after } = readDiscoveryRequest(request);
    stage = "query";
    const sessions = await dependencies.discoverSessions.searchPublic(criteria);
    stage = "serialization";
    return discoveryJson(toDiscoveryPage(sessions, after));
  } catch (error) {
    return discoveryErrorResponse(error, stage);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const dependencies = await loadDependencies(getSessionDependencies);
    const bookerId = await requireUserId(request, dependencies.authenticate);
    const { input, submission } = await readCreateSessionRequest(request, bookerId);
    const createSessions = dependencies.createForSubmission(submission);
    const result = await createSessions.forBooker(
      input.bookerId,
      input.booking,
      input.config,
    );
    return Response.json(result, { status: 201 });
  } catch (error) {
    return sessionCreationErrorResponse(error);
  }
}
