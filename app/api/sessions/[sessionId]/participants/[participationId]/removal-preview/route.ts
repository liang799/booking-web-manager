import { participantRemovalGetAction } from "@/app/sessions/removal-action";
import { parseRemovalParams } from "@/app/sessions/removal-input";

export const runtime = "nodejs";

export const GET = participantRemovalGetAction({
  parse: (bookerId, params) => ({
    bookerId,
    ...parseRemovalParams(params.sessionId, params.participationId),
  }),
  run: (dependencies, input) => dependencies.previewRemoval.forBooker(
    input.bookerId, input.sessionId, input.participationId,
  ),
});
