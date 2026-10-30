import { after } from "next/server";

/** Called only after successful persistence; no request data is read by the deferred task. */
export function deferNotificationBroadcast(work: () => Promise<void>): void {
  after(work);
}
