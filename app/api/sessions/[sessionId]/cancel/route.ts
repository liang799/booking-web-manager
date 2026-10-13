import { sessionCancellationAction } from "@/app/sessions/cancellation-action";
import { parseCancellationInput } from "@/app/sessions/cancellation-input";

export const runtime = "nodejs";

export const POST = sessionCancellationAction({
  parse: (bookerId, body, params) => ({
    bookerId,
    ...parseCancellationInput(params.sessionId, body),
  }),
  run: (dependencies, input) => dependencies.createCancellation({ idempotencyKey: input.idempotencyKey })
    .forBooker(input.bookerId, input.sessionId, input.previewVersion),
  invalidRequestMessage: "Invalid session cancellation request",
});
