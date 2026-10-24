import type { UUID } from "@/domain";
import { createAuthenticatedActions } from "@/app/http/authenticated-action";
import { isRequestFailure } from "@/app/http/request-failure";
import type { WalletApiDependencies } from "./dependencies";
import { getWalletDependencies } from "./server-dependencies";
import { walletErrorResponse } from "./wallet-response";
import { z } from "zod";

const actions = createAuthenticatedActions({
  getDependencies: getWalletDependencies,
  errorResponse: walletErrorResponse,
});

export interface WalletPostAction<Input, Output> {
  readonly serialize?: (output: Output) => unknown;
  /** Validates the body and combines it with the authenticated user ID. */
  readonly parse: (userId: UUID, body: unknown) => Input;
  /** Calls the action's use case with the parsed input. */
  readonly run: (
    dependencies: WalletApiDependencies,
    input: Input,
  ) => Promise<Output>;
  /** Message for a body that fails validation. */
  readonly invalidRequestMessage: string;
  /** Defaults to 200. */
  readonly successStatus?: number;
}

export interface WalletGetAction<Output> {
  readonly serialize?: (output: Output) => unknown;
  /** Calls the action's use case with the authenticated user ID. */
  readonly run: (
    dependencies: WalletApiDependencies,
    userId: UUID,
  ) => Promise<Output>;
}

export interface WalletQueryAction<Input, Output> {
  readonly serialize?: (output: Output) => unknown;
  /** Validates the request query and combines it with the authenticated user ID. */
  readonly parse: (userId: UUID, request: Request) => Input;
  /** Calls the action's use case with the parsed query input. */
  readonly run: (
    dependencies: WalletApiDependencies,
    input: Input,
  ) => Promise<Output>;
  /** Message for a query that fails validation. */
  readonly invalidRequestMessage?: string;
}

/**
 * Builds the POST handler for one wallet action.
 * Owns the shared HTTP policy: loading cached dependencies, authentication,
 * JSON parsing, domain error mapping and `no-store` responses.
 */
export function walletAction<Input, Output>(
  action: WalletPostAction<Input, Output>,
): (request: Request) => Promise<Response> {
  return actions.json({
    ...action,
    parse: (userId, body) => parseWalletInput(() => action.parse(userId, body)),
    run: (dependencies, parsed) => {
      if (!parsed.ok) throw parsed.error;
      return action.run(dependencies, parsed.input);
    },
  });
}

/**
 * Builds the parameterless GET handler for one wallet action.
 * Owns the shared HTTP policy: loading cached dependencies, authentication,
 * domain error mapping and `no-store` responses.
 */
export function walletGetAction<Output>(
  action: WalletGetAction<Output>,
): (request: Request) => Promise<Response> {
  return actions.get({ ...action, parse: (userId) => userId });
}

/**
 * Builds the query-parameter GET handler for one wallet action.
 * Owns the shared HTTP policy: loading cached dependencies, authentication,
 * query parameter parsing, domain error mapping and `no-store` responses.
 */
export function walletQueryAction<Input, Output>(
  action: WalletQueryAction<Input, Output>,
): (request: Request) => Promise<Response> {
  return actions.get({
    ...action,
    parse: (userId, _params, request) => parseWalletInput(() => action.parse(userId, request)),
    run: (dependencies, parsed) => {
      if (!parsed.ok) throw parsed.error;
      return action.run(dependencies, parsed.input);
    },
  });
}

type WalletInput<Input> =
  | { readonly ok: true; readonly input: Input }
  | { readonly ok: false; readonly error: unknown };

/** Wallet validation also declares business failures, such as top-up limits (422). */
function parseWalletInput<Input>(parse: () => Input): WalletInput<Input> {
  try {
    return { ok: true, input: parse() };
  } catch (error) {
    // Request failures retain the shared boundary's 400 policy. Preserve the
    // wallet mapper for its existing domain failures without running a use case.
    if (error instanceof z.ZodError || isRequestFailure(error)) throw error;
    return { ok: false, error };
  }
}
