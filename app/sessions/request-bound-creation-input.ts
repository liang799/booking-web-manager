import type { RequestBoundSessionCreationSubmission } from "@/lib/sessions/request-session-creation-transaction";
import { parseCreateSessionInput } from "./create-session-input";

/**
 * Opt the HTTP endpoint into payload-aware retries without changing its business
 * input or the use case. The existing parser strips untrusted fields, obtains
 * the actor from authentication and normalizes timestamps to Date instants.
 */
export function parseRequestBoundCreateSessionInput(actorUserId: unknown, body: unknown) {
  const { input, submission } = parseCreateSessionInput(actorUserId, body);
  const boundSubmission: RequestBoundSessionCreationSubmission = {
    ...submission,
    request: input,
  };
  return { input, submission: boundSubmission };
}
