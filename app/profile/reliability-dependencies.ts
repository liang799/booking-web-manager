import type { GetReliabilityScore } from "@/use-cases/accounts/get-reliability-score";

export interface ReliabilityDependencies {
  readonly reliabilityScore: Pick<GetReliabilityScore, "forUser">;
}

/** The server has no database settings, so no score can be read. */
export class ReliabilityUnavailableError extends Error {
  constructor() {
    super("Reliability scores are unavailable");
    this.name = "ReliabilityUnavailableError";
  }
}
