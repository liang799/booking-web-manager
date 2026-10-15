import { loadDependencies } from "@/app/http/load-dependencies";
import type { DiscoveryDependencies } from "./dependencies";
import { getDiscoveryDependencies } from "./server-dependencies";
import { discoveryErrorResponse, discoveryJson, type DiscoveryFailureStage } from "./response";

/** Public discovery has no authentication step and retains stage-aware diagnostics. */
export function discoveryAction<Input, Output>(action: {
  readonly parse: (request: Request) => Input;
  readonly run: (dependencies: DiscoveryDependencies, input: Input) => Promise<Output>;
  readonly serialize: (output: Output, input: Input) => unknown;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    let stage: DiscoveryFailureStage = "initialization";
    try {
      const dependencies = await loadDependencies(getDiscoveryDependencies);
      stage = "validation";
      const input = action.parse(request);
      stage = "query";
      const result = await action.run(dependencies, input);
      stage = "serialization";
      return discoveryJson(action.serialize(result, input));
    } catch (error) {
      return discoveryErrorResponse(error, stage);
    }
  };
}
