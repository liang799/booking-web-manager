import { createNotificationDependencies } from "@/use-case-config/notifications";
import type { NotificationDependencies } from "./dependencies";

let initialization: Promise<NotificationDependencies> | undefined;
export function getNotificationDependencies(): Promise<NotificationDependencies> {
  initialization ??= Promise.resolve().then(createNotificationDependencies).catch((error) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}
