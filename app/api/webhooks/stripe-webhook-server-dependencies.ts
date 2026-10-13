import { createStripeWebhookDependencies } from "@/use-case-config/stripe-webhooks";
import type { StripeWebhookDependencies } from "./stripe-webhook";

let initialization: Promise<StripeWebhookDependencies | undefined> | undefined;

/** Shares successful configuration and permits retry after setup failure. */
export function getStripeWebhookDependencies(): Promise<StripeWebhookDependencies | undefined> {
  initialization ??= Promise.resolve()
    .then(createStripeWebhookDependencies)
    .catch((error) => {
      initialization = undefined;
      throw error;
    });
  return initialization;
}
