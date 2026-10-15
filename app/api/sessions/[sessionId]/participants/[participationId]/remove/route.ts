import { participantRemovalAction } from "@/app/sessions/removal-action";
import { parseRemovalInput } from "@/app/sessions/removal-input";

export const runtime = "nodejs";

export const POST = participantRemovalAction({
  parse: (bookerId, body, params) => ({
    bookerId,
    ...parseRemovalInput(params.sessionId, params.participationId, body),
  }),
  run: (dependencies, input) => dependencies.createRemoval({ idempotencyKey: input.idempotencyKey })
    .forBooker(input.bookerId, input.sessionId, input.participationId, input.previewVersion),
  invalidRequestMessage: "Invalid participant removal request",
});
