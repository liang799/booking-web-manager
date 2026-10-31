import { createClient } from "@/lib/supabase/client";

export function subscribeToNotifications(
  userId: string,
  invalidate: () => void,
  onAccessLost: () => void,
): () => void {
  const client = createClient();
  let stopped = false,
    attempt = 0;
  let channel: ReturnType<typeof client.channel> | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  function remove() {
    const previous = channel;
    channel = undefined;
    return previous
      ? client.removeChannel(previous).catch(() => undefined)
      : Promise.resolve();
  }
  function retry() {
    if (stopped || timer) return;
    void remove().then(() => {
      if (stopped) return;
      timer = setTimeout(
        () => {
          timer = undefined;
          void connect();
        },
        Math.min(1000 * 2 ** Math.min(attempt++, 5), 30_000),
      );
    });
  }
  async function connect() {
    try {
      const {
        data: { session },
      } = await client.auth.getSession();
      if (stopped) return;
      if (!session || session.user.id !== userId) {
        onAccessLost();
        return;
      }
      await client.realtime.setAuth(session.access_token);
      if (stopped) return;
      const current = client.channel(`user:${userId}:notifications`, {
        config: { private: true },
      });
      channel = current;
      current
        .on("broadcast", { event: "notifications_changed" }, () => {
          if (!stopped && channel === current) invalidate();
        })
        .subscribe((status) => {
          if (stopped || channel !== current) return;
          if (status === "SUBSCRIBED") {
            attempt = 0;
            invalidate();
          } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status))
            retry();
        });
    } catch {
      retry();
    }
  }
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event, session) => {
    if (stopped) return;
    if (event === "SIGNED_OUT" || (session && session.user.id !== userId)) {
      onAccessLost();
      void remove();
    } else if (event === "TOKEN_REFRESHED" && session)
      void client.realtime
        .setAuth(session.access_token)
        .then(() => {
          if (!stopped) invalidate();
        })
        .catch(retry);
  });
  void connect();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    subscription.unsubscribe();
    void remove();
  };
}
