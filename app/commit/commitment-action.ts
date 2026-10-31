import type { UUID } from "@/domain";
import { createAuthenticatedActions } from "@/app/http/authenticated-action";
import type { CommitmentDependencies } from "./commitment-dependencies";
import { getCommitmentDependencies } from "./commitment-server-dependencies";
import { commitmentErrorResponse } from "./http";

const actions = createAuthenticatedActions({
  getDependencies: getCommitmentDependencies,
  errorResponse: commitmentErrorResponse,
});

export interface CommitmentAction<Input, Output> {
  /** Validates the body and combines it with the authenticated user ID. */
  readonly parse: (userId: UUID, body: unknown) => Input;
  /** Calls the action's use case with the parsed input. */
  readonly run: (dependencies: CommitmentDependencies, input: Input) => Promise<Output>;
  /** Message for a body that fails validation. */
  readonly invalidRequestMessage: string;
  /** Defaults to 200. */
  readonly successStatus?: number;
}

/**
 * Builds the POST handler for one commitment action. The route supplies only
 * its validation and use-case call; this owns the shared HTTP policy: loading
 * the cached dependencies (an unexpected setup failure is an opaque 500, an
 * unconfigured server answers 503), authentication, JSON parsing, domain
 * error mapping and `no-store` responses.
 */
export function commitmentAction<Input, Output>(
  action: CommitmentAction<Input, Output>,
): (request: Request) => Promise<Response> {
  return actions.json(action);
}
