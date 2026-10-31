export type PostCommitNotificationPublisher = (recipients: readonly string[]) => void;

const BROADCAST_BATCH_SIZE = 100;
const BROADCAST_TIMEOUT_MS = 2_000;

/** Only empty invalidation hints leave the server; canonical messages are already committed. */
export function createPostCommitNotificationPublisher(
  settings: { readonly url: string; readonly serviceRoleKey: string } | undefined,
  defer: (work: () => Promise<void>) => void,
  fetch_: typeof fetch = fetch,
): PostCommitNotificationPublisher {
  return (recipients) => {
    if (!settings || !recipients.length) return;
    const topics = [...new Set(recipients)].map((recipient) => ({ topic:`user:${recipient}:notifications`,event:"notifications_changed",payload:{},private:true }));
    try {
      defer(async () => {
        // A shared deadline bounds the entire publication, including large fan-out.
        const signal = AbortSignal.timeout(BROADCAST_TIMEOUT_MS);
        for (let start = 0; start < topics.length; start += BROADCAST_BATCH_SIZE) {
          if (signal.aborted) break;
          try {
            const response = await fetch_(`${settings.url.replace(/\/$/,"")}/realtime/v1/api/broadcast`, {
              method:"POST",headers:{ apikey:settings.serviceRoleKey,Authorization:`Bearer ${settings.serviceRoleKey}`,"Content-Type":"application/json" },
              body:JSON.stringify({ messages:topics.slice(start, start + BROADCAST_BATCH_SIZE) }),signal,
            });
            if (!response.ok) console.warn("Notification invalidation unavailable", { status:response.status });
            await response.body?.cancel();
          } catch { console.warn("Notification invalidation unavailable"); }
        }
      });
    } catch { console.warn("Notification invalidation could not be scheduled"); }
  };
}
