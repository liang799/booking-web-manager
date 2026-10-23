/** Page-only timing sampled after the authoritative server read. */
export interface DiscoveryExpiry {
  readonly startsAt: number;
  readonly serverNow: number;
}

export interface DiscoveryUpdates {
  /** Called after a router transition settles, including failed reads. */
  complete(): void;
  /** Reconcile a server result; elapsed read time conservatively accounts for transport delay. */
  expireAt(expiry: DiscoveryExpiry | null, elapsedReadMs?: number): void;
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
  let expiryDeadline: number | undefined;
  let expirySignalled = false;
  let expiryAttempts = 0;
  let unsubscribe: (() => void) | undefined;

  const active = () => options.document.visibilityState === "visible" && options.online();

  function schedule() {
    if (stopped || !dirty || inFlight || refreshTimer !== undefined || !active() || !options.canRefresh()) return;
    // Do not reset an existing timer: a sustained stream must not starve refreshes.
    refreshTimer = setTimeout(flush, Math.max(COALESCE_MS, nextRefreshAt - performance.now()));
  }

  function flush() {
    refreshTimer = undefined;
    if (stopped || !dirty || inFlight || !active() || !options.canRefresh()) return;
    dirty = false;
    inFlight = true;
    nextRefreshAt = performance.now() + MIN_REFRESH_MS;
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
    if (stopped || expiryDeadline === undefined || expirySignalled) return;
    const delay = expiryDeadline - performance.now();
    if (delay <= 0) {
      expirySignalled = true;
      expiryAttempts += 1;
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
  // Initial RSC/hydration age is unknown. Catch up even when Realtime is unavailable.
  invalidate();

  return {
    complete() {
      if (stopped) return;
      inFlight = false;
      // Events arriving during a read/navigation are retained for one subsequent read.
      schedule();
    },
    expireAt(timing, elapsedReadMs = 0) {
      if (timing === null || !Number.isFinite(timing.startsAt) || !Number.isFinite(timing.serverNow)) {
        expiry = undefined;
        expiryDeadline = undefined;
        expirySignalled = false;
        expiryAttempts = 0;
        armExpiry();
        return;
      }
      const same = timing.startsAt === expiry;
      if (!same) expiryAttempts = 0;
      const elapsed = Number.isFinite(elapsedReadMs) ? Math.max(0, elapsedReadMs) : 0;
      // Use server duration, never the browser's wall clock. Subtracting the full
      // read duration can fire early, but cannot extend expiry after a slow response.
      let delay = Math.max(0, timing.startsAt - timing.serverNow - elapsed);
      if (same && expirySignalled && delay === 0) {
        // Repeated stale responses must retry, without creating a perpetual 1 Hz loop.
        delay = Math.min(1_000 * 2 ** Math.min(expiryAttempts - 1, 5), DISCOVERY_RECONCILE_MS);
      }
      const deadline = performance.now() + delay;
      // A later response with the same first card cannot postpone an armed deadline.
      expiryDeadline = same && !expirySignalled && expiryDeadline !== undefined
        ? Math.min(expiryDeadline, deadline) : deadline;
      expiry = timing.startsAt;
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
