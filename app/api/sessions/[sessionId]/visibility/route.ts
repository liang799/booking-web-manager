import { sessionManagementAction } from "@/app/sessions/management-action";
import { parseSessionVisibilityInput } from "@/app/sessions/visibility-input";

export const runtime = "nodejs";

/** Sets session visibility for the bearer-authenticated owner and returns the committed result or a safe HTTP error. */
export const PATCH = sessionManagementAction({
  parse: (bookerId, body, params) => ({
    bookerId,
    ...parseSessionVisibilityInput(params.sessionId, body),
  }),
  run: (dependencies, input) => dependencies.toggleVisibility.forBooker(
    input.bookerId, input.sessionId, input.visibility,
  ),
  invalidRequestMessage: "Invalid session visibility request",
});
