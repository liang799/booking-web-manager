export type PostCommitNotificationPublisher = (recipients: readonly string[]) => void;

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
        try {
          const response = await fetch_(`${settings.url.replace(/\/$/,"")}/realtime/v1/api/broadcast`, {
            method:"POST",headers:{ apikey:settings.serviceRoleKey,Authorization:`Bearer ${settings.serviceRoleKey}`,"Content-Type":"application/json" },
            body:JSON.stringify({ messages:topics }),signal:AbortSignal.timeout(2_000),
          });
          if (!response.ok) console.warn("Notification invalidation unavailable", { status:response.status });
          await response.body?.cancel();
        } catch { console.warn("Notification invalidation unavailable"); }
      });
    } catch { console.warn("Notification invalidation could not be scheduled"); }
  };
}
