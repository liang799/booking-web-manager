import { deferNotificationBroadcast } from "@/app/notifications/defer";
import { createPostCommitNotificationPublisher } from "@/lib/notifications/postcommit-publisher";

/** Realtime is optional: missing publisher settings never disable the canonical inbox. */
export function createNotificationPublisher() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createPostCommitNotificationPublisher(
    url && serviceRoleKey ? { url, serviceRoleKey } : undefined,
    deferNotificationBroadcast,
  );
}
