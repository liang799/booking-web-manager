import { createPayoutDependencies } from "@/use-case-config/payouts";
import type { PayoutDependencies } from "./payout-dependencies";

let initialization: Promise<PayoutDependencies> | undefined;

/** Shares successful configuration and permits retry after setup failure. */
export function getPayoutDependencies(): Promise<PayoutDependencies> {
  initialization ??= Promise.resolve()
    .then(() => createPayoutDependencies())
    .catch((error) => {
      initialization = undefined;
      throw error;
    });
  return initialization;
}
