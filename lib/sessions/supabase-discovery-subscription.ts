import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

const TOPIC = "discovery:public:v1";
const EVENT = "invalidate";

/**
 * Receives payload-free hints, never rows. This dedicated public client does not
 * depend on login, read tables, or share channel teardown with authenticated UI.
 */
export function subscribeToDiscoveryInvalidation(
  settings: { readonly url: string; readonly key: string },
  invalidate: () => void,
): () => void {
  const client = createClient(settings.url, settings.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let stopped = false;
  let channel: RealtimeChannel | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let restarting = false;
  let attempts = 0;

  function restart() {
    if (stopped || restarting) return;
    restarting = true;
    const previous = channel;
    channel = undefined;
    const delay = Math.min(1_000 * 2 ** Math.min(attempts++, 5), 30_000);
    // Wait for removal so rejoining the same topic cannot reuse a closing channel.
    const removed = previous === undefined ? Promise.resolve() : client.removeChannel(previous);
    void removed.catch(() => undefined).then(() => {
      if (stopped) return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        restarting = false;
        connect();
      }, delay);
    });
  }

  function connect() {
    if (stopped) return;
    try {
      const current = client.channel(TOPIC, { config: { private: false } });
      channel = current;
      current.on("broadcast", { event: EVENT }, () => {
        // Public messages are untrusted hints. Never merge their payload into UI state.
        if (!stopped && channel === current) invalidate();
      }).subscribe((status) => {
        if (stopped || channel !== current) return;
        if (status === "SUBSCRIBED") {
          attempts = 0;
          // Catch changes between the initial server read and subscribing/reconnecting.
          invalidate();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          restart();
        }
      });
    } catch {
      restart();
    }
  }

  connect();
  return () => {
    if (stopped) return;
    stopped = true;
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    const previous = channel;
    channel = undefined;
    if (previous !== undefined) void client.removeChannel(previous).catch(() => undefined);
    client.realtime.disconnect();
  };
}
