import { createRegisteredEmails } from "@/use-case-config/registered-emails";
import type { RegisteredEmails } from "./registered-emails";

let initialization: Promise<RegisteredEmails> | undefined;

/** Shares successful configuration and permits retry after setup failure. */
export function getRegisteredEmails(): Promise<RegisteredEmails> {
  initialization ??= Promise.resolve()
    .then(createRegisteredEmails)
    .catch((error) => {
      initialization = undefined;
      throw error;
    });
  return initialization;
}
