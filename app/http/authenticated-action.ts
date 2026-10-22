import type { UUID } from "@/domain";
import { z } from "zod";
import { loadDependencies } from "./load-dependencies";
import { requireUserId } from "./require-user-id";
import { invalidRequest, isRequestFailure } from "./request-failure";

type RouteParams = Readonly<Record<string, string>>;
type RouteContext = { params: Promise<RouteParams> };
type AuthenticatedDependencies = { authenticate: (request: Request) => Promise<UUID | null> };

interface Action<Dependencies, Input, Output> {
  readonly run: (dependencies: Dependencies, input: Input) => Promise<Output>;
  readonly serialize?: (output: Output) => unknown;
  readonly successStatus?: number;
}

interface JsonAction<Dependencies, Input, Output> extends Action<Dependencies, Input, Output> {
  readonly parse: (userId: UUID, body: unknown, params: RouteParams) => Input;
  readonly invalidRequestMessage: string;
}

interface GetAction<Dependencies, Input, Output> extends Action<Dependencies, Input, Output> {
  readonly parse: (userId: UUID, params: RouteParams, request: Request) => Input;
  readonly invalidRequestMessage?: string;
}

/** Configure a feature's HTTP policy once; routes supply parsing and the use-case call. */
export function createAuthenticatedActions<Dependencies extends AuthenticatedDependencies>(policy: {
  readonly getDependencies: () => Promise<Dependencies>;
  readonly errorResponse: (error: unknown) => Response;
  /** Defaults to no-store; pass an empty object to omit success headers. */
  readonly successHeaders?: HeadersInit;
}) {
  function handler<Input, Output>(
    action: Action<Dependencies, Input, Output>,
    readInput: (request: Request, userId: UUID, params: RouteParams) => Input | Promise<Input>,
  ) {
    // Static callers need only a request; Next validates the last signature's required context.
    function handleRequest(request: Request): Promise<Response>;
    function handleRequest(request: Request, context: RouteContext): Promise<Response>;
    async function handleRequest(request: Request, context?: RouteContext): Promise<Response> {
      try {
        const dependencies = await loadDependencies(policy.getDependencies);
        const userId = await requireUserId(request, dependencies.authenticate);
        const params = await readParams(context);
        const input = await readInput(request, userId, params);
        const result = await action.run(dependencies, input);
        return Response.json(action.serialize ? action.serialize(result) : result, {
          status: action.successStatus ?? 200,
          headers: policy.successHeaders ?? { "Cache-Control": "no-store" },
        });
      } catch (error) {
        return policy.errorResponse(error);
      }
    }
    return handleRequest;
  }

  return {
    json<Input, Output>(action: JsonAction<Dependencies, Input, Output>) {
      return handler(action, async (request, userId, params) => {
        const body = await readJson(request);
        return parseInput(() => action.parse(userId, body, params), action.invalidRequestMessage);
      });
    },
    get<Input, Output>(action: GetAction<Dependencies, Input, Output>) {
      return handler(action, (request, userId, params) => parseInput(
        () => action.parse(userId, params, request),
        action.invalidRequestMessage ?? "Invalid request parameters",
      ));
    },
  };
}

async function readParams(context?: RouteContext): Promise<RouteParams> {
  try {
    return context ? await context.params : {};
  } catch (cause) {
    throw new Error("Route parameters could not be loaded", { cause });
  }
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (cause) {
    if (cause instanceof SyntaxError) throw invalidRequest("Request body must be valid JSON");
    // A provider/domain-shaped read failure is still an infrastructure failure.
    throw new Error("Request body could not be read", { cause });
  }
}

function parseInput<Input>(parse: () => Input, invalidRequestMessage: string): Input {
  try {
    return parse();
  } catch (cause) {
    if (cause instanceof z.ZodError) throw invalidRequest(invalidRequestMessage);
    if (isRequestFailure(cause)) throw cause;
    throw new Error("Request input could not be parsed", { cause });
  }
}
