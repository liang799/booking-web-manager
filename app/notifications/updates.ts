/** Realtime signals are hints; foreground HTTP reconciliation repairs loss and disconnects. */
export function startNotificationUpdates(options: {
  refresh: () => Promise<void>;
  subscribe: (invalidate: () => void) => () => void;
  document: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  >;
  window: Pick<Window, "addEventListener" | "removeEventListener">;
  online: () => boolean;
}) {
  let stopped = false,
    dirty = false,
    inFlight = false,
    last = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined,
    unsubscribe: (() => void) | undefined;
  const active = () =>
    options.document.visibilityState === "visible" && options.online();
  function schedule() {
    if (stopped || !active() || !dirty || inFlight || timer) return;
    timer = setTimeout(flush, Math.max(250, last + 1000 - performance.now()));
  }
  function invalidate() {
    dirty = true;
    schedule();
  }
  function flush() {
    timer = undefined;
    if (stopped || !active() || !dirty) return;
    dirty = false;
    inFlight = true;
    last = performance.now();
    void options
      .refresh()
      .catch(() => {})
      .finally(() => {
        inFlight = false;
        schedule();
      });
  }
  function resume() {
    if (stopped) return;
    if (!active()) {
      unsubscribe?.();
      unsubscribe = undefined;
      return;
    }
    if (!unsubscribe) unsubscribe = options.subscribe(invalidate);
    invalidate();
  }
  const interval = setInterval(resume, 120_000);
  options.document.addEventListener("visibilitychange", resume);
  options.window.addEventListener("focus", resume);
  options.window.addEventListener("online", resume);
  options.window.addEventListener("offline", resume);
  resume();
  return () => {
    stopped = true;
    clearInterval(interval);
    if (timer) clearTimeout(timer);
    unsubscribe?.();
    options.document.removeEventListener("visibilitychange", resume);
    options.window.removeEventListener("focus", resume);
    options.window.removeEventListener("online", resume);
    options.window.removeEventListener("offline", resume);
  };
}
