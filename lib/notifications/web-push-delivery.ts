import webpush, { WebPushError } from "web-push";
import type { VapidDetails } from "@/lib/commit/web-push-sender";
import type { NotificationPushSender } from "./push-dispatcher";

export function createNotificationPushSender(vapid: VapidDetails): NotificationPushSender {
  return async (job,payload,ttlSeconds) => {
    try {
      await webpush.sendNotification({endpoint:job.endpoint,keys:{p256dh:job.p256dh,auth:job.auth}},payload,
        {vapidDetails:vapid,TTL:ttlSeconds,urgency:"high",timeout:5_000});
      return "DELIVERED";
    } catch (error) {
      if (error instanceof WebPushError) {
        if (error.statusCode===404 || error.statusCode===410) return "EXPIRED";
        if (error.statusCode===400 || error.statusCode===413 || error.statusCode===422) return "TERMINAL";
      }
      return "FAILED";
    }
  };
}
