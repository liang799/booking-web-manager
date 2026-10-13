import { sessionCreationAction } from "@/app/sessions/creation-action";
import { parseCreateSessionInput } from "@/app/sessions/create-session-input";
import { discoveryAction } from "@/app/discover/discovery-action";
import { readDiscoveryRequest } from "@/app/discover/request";
import { toDiscoveryPage } from "@/app/discover/contracts";

export const runtime = "nodejs";

export const GET = discoveryAction({
  parse: readDiscoveryRequest,
  run: (dependencies, input) => dependencies.discoverSessions.searchPublic(input.criteria),
  serialize: (sessions, input) => toDiscoveryPage(sessions, input.after),
});

export const POST = sessionCreationAction({
  parse: parseCreateSessionInput,
  run: (dependencies, { input, submission }) => dependencies.createForSubmission(submission)
    .forBooker(input.bookerId, input.booking, input.config),
  invalidRequestMessage: "Invalid session creation request",
  successStatus: 201,
});
