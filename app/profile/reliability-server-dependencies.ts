import { createReliabilityDependencies } from "@/use-case-config/profiles";
import type { ReliabilityDependencies } from "./reliability-dependencies";

let initialization: Promise<ReliabilityDependencies> | undefined;

/** Shares infrastructure across requests, never a user's score. */
export async function getReliabilityDependencies(): Promise<ReliabilityDependencies> {
  initialization ??= Promise.resolve().then(createReliabilityDependencies).catch((error) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}
