import { sessionInvitationGetAction } from "@/app/sessions/invitation-action";
import { sessionInvitationParamsSchema, toSessionInvitationResponse } from "@/app/sessions/invitation-contract";

export const runtime = "nodejs";

export const GET = sessionInvitationGetAction({
  parse: (bookerId, params) => ({ bookerId, ...sessionInvitationParamsSchema.parse(params) }),
  run: (dependencies, input) => dependencies.invitation.forBooker(input.bookerId, input.sessionId),
  serialize: toSessionInvitationResponse,
  invalidRequestMessage: "Invalid session invitation request",
});
