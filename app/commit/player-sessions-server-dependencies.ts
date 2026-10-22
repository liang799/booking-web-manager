import { createPlayerSessionsDependencies } from "@/use-case-config/player-sessions";
import type { PlayerSessionsDependencies } from "./player-sessions-dependencies";

let initialization: Promise<PlayerSessionsDependencies> | undefined;

/** Shares successful configuration and permits retry after setup failure. */
export function getPlayerSessionsDependencies(): Promise<PlayerSessionsDependencies> {
  initialization ??= Promise.resolve()
    .then(createPlayerSessionsDependencies)
    .catch((error) => {
      initialization = undefined;
      throw error;
    });
  return initialization;
}
