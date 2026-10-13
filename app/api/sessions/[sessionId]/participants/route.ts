import { participantRemovalGetAction } from "@/app/sessions/removal-action";
import { parseRemovalSessionId } from "@/app/sessions/removal-input";
import { serializeSessionParticipants } from "@/app/sessions/removal-types";

export const runtime = "nodejs";

export const GET = participantRemovalGetAction({
  parse: (bookerId, params) => ({
    bookerId,
    sessionId: parseRemovalSessionId(params.sessionId),
  }),
  run: (dependencies, input) => dependencies.listParticipants.forBooker(input.bookerId, input.sessionId),
  serialize: serializeSessionParticipants,
});
