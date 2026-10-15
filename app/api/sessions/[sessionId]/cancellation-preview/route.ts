import { sessionCancellationGetAction } from "@/app/sessions/cancellation-action";
import { parseCancellationSessionId } from "@/app/sessions/cancellation-input";
import { withCancellationAction } from "@/app/sessions/session-actions";

export const runtime = "nodejs";

export const GET = sessionCancellationGetAction({
  parse: (bookerId, params) => ({
    bookerId,
    sessionId: parseCancellationSessionId(params.sessionId),
  }),
  run: (dependencies, input) => dependencies.previewCancellation.forBooker(input.bookerId, input.sessionId),
  serialize: withCancellationAction,
});
