export interface DiscoveryUpdates {
  /** Called after a router transition settles, including failed reads. */
  complete(): void;
  /** The next displayed session start; time passing does not emit a database event. */
  expireAt(timestamp: number | undefined): void;
  stop(): void;
}

export const DISCOVERY_RECONCILE_MS = 30_000;
const COALESCE_MS = 250;
const MIN_REFRESH_MS = 1_000;
const MAX_TIMEOUT_MS = 2_147_483_647;

/** Realtime is an invalidation hint; the server remains the only owner of results. */
export function startDiscoveryUpdates(options: {
  readonly refresh: () => void;
  readonly canRefresh: () => boolean;
  readonly subscribe: (invalidate: () => void) => () => void;
  readonly document: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
  readonly window: Pick<Window, "addEventListener" | "removeEventListener">;
  readonly online: () => boolean;
}): DiscoveryUpdates {
  let stopped = false;
  let inFlight = false;
  let dirty = false;
  let nextRefreshAt = 0;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let expiry: number | undefined;
  let expirySignalled = false;
  let unsubscribe: (() => void) | undefined;

  const active = () => options.document.visibilityState === "visible" && options.online();

  function schedule() {
    if (stopped || !dirty || inFlight || refreshTimer !== undefined || !active() || !options.canRefresh()) return;
    // Do not reset an existing timer: a sustained stream must not starve refreshes.
    refreshTimer = setTimeout(flush, Math.max(COALESCE_MS, nextRefreshAt - Date.now()));
  }

  function flush() {
    refreshTimer = undefined;
    if (stopped || !dirty || inFlight || !active() || !options.canRefresh()) return;
    dirty = false;
    inFlight = true;
    nextRefreshAt = Date.now() + MIN_REFRESH_MS;
    try {
      options.refresh();
    } catch (error) {
      inFlight = false;
      throw error;
    }
  }

  function invalidate() {
    if (stopped) return;
    dirty = true;
    schedule();
  }

  function connect() {
    if (stopped) return;
    if (!active()) {
      unsubscribe?.();
      unsubscribe = undefined;
      return;
    }
    if (unsubscribe === undefined) unsubscribe = options.subscribe(invalidate);
  }

  function resume() {
    connect();
    if (active()) invalidate();
  }

  function armExpiry() {
    if (expiryTimer !== undefined) clearTimeout(expiryTimer);
    expiryTimer = undefined;
    if (stopped || expiry === undefined || expirySignalled) return;
    const delay = expiry - Date.now();
    if (delay <= 0) {
      expirySignalled = true;
      invalidate();
      return;
    }
    // Browsers overflow long timeouts. Wake and re-check rather than expiring early.
    expiryTimer = setTimeout(armExpiry, Math.min(delay, MAX_TIMEOUT_MS));
  }

  // Reconcile missed events, failed subscriptions and deployments without Realtime.
  // It is intentionally much slower than the removed one-second polling loop.
  const reconciliation = setInterval(() => { connect(); invalidate(); }, DISCOVERY_RECONCILE_MS);
  options.document.addEventListener("visibilitychange", resume);
  options.window.addEventListener("online", resume);
  options.window.addEventListener("offline", connect);
  connect();

  return {
    complete() {
      if (stopped) return;
      inFlight = false;
      // Events arriving during a read/navigation are retained for one subsequent read.
      schedule();
    },
    expireAt(timestamp) {
      const next = timestamp !== undefined && Number.isFinite(timestamp) ? timestamp : undefined;
      if (next === expiry) return;
      expiry = next;
      expirySignalled = false;
      armExpiry();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(reconciliation);
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      if (expiryTimer !== undefined) clearTimeout(expiryTimer);
      unsubscribe?.();
      unsubscribe = undefined;
      options.document.removeEventListener("visibilitychange", resume);
      options.window.removeEventListener("online", resume);
      options.window.removeEventListener("offline", connect);
    },
  };
}
