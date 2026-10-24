import { afterEach, describe, expect, test, vi } from "vitest";
import { DISCOVERY_RECONCILE_MS, startDiscoveryUpdates } from "@/app/discover/_components/discovery-updates";

afterEach(() => vi.useRealTimers());

function scenario() {
  vi.useFakeTimers({ toFake: ["Date", "performance", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.setSystemTime(0);
  const documentEvents = new EventTarget();
  const windowEvents = new EventTarget();
  let visible = true;
  let online = true;
  let allowed = true;
  let notify = () => {};
  const unsubscribe = vi.fn();
  const subscribe = vi.fn((invalidate: () => void) => { notify = invalidate; return unsubscribe; });
  const refresh = vi.fn();
  const updates = startDiscoveryUpdates({
    refresh, subscribe, canRefresh: () => allowed, online: () => online,
    document: {
      get visibilityState() { return visible ? "visible" : "hidden"; },
      addEventListener: documentEvents.addEventListener.bind(documentEvents),
      removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
    },
    window: {
      addEventListener: windowEvents.addEventListener.bind(windowEvents),
      removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    },
  });
  return {
    updates, refresh, subscribe, unsubscribe,
    notify: () => notify(),
    allow(value: boolean) { allowed = value; },
    visible(value: boolean) { visible = value; documentEvents.dispatchEvent(new Event("visibilitychange")); },
    online(value: boolean) { online = value; windowEvents.dispatchEvent(new Event(value ? "online" : "offline")); },
  };
}

describe("discovery event-driven refresh", () => {
  test("does not poll every second; reconciles after thirty seconds", () => {
    const s = scenario();
    vi.advanceTimersByTime(250);
    expect(s.refresh).toHaveBeenCalledOnce();
    s.updates.complete(); s.refresh.mockClear();
    vi.advanceTimersByTime(DISCOVERY_RECONCILE_MS - 1);
    expect(s.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(s.refresh).toHaveBeenCalledOnce();
    s.updates.stop();
  });

  test("coalesces a burst without waiting forever for events to stop", () => {
    const s = scenario();
    for (let i = 0; i < 5; i += 1) { s.notify(); vi.advanceTimersByTime(50); }
    expect(s.refresh).toHaveBeenCalledOnce();
    s.updates.stop();
  });

  test("retains events during a read and performs one throttled follow-up", () => {
    const s = scenario();
    s.notify();
    vi.advanceTimersByTime(250);
    s.notify(); s.notify();
    vi.advanceTimersByTime(500);
    expect(s.refresh).toHaveBeenCalledOnce();
    s.updates.complete();
    vi.advanceTimersByTime(499);
    expect(s.refresh).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    expect(s.refresh).toHaveBeenCalledTimes(2);
    s.updates.stop();
  });

  test("does not refresh again on completion without another invalidation", () => {
    const s = scenario();
    s.notify(); vi.advanceTimersByTime(250);
    s.updates.complete(); vi.advanceTimersByTime(5_000);
    expect(s.refresh).toHaveBeenCalledOnce();
    s.updates.stop();
  });

  test("retains an invalidation across foreground navigation", () => {
    const s = scenario();
    s.allow(false); s.notify();
    vi.advanceTimersByTime(3_000);
    expect(s.refresh).not.toHaveBeenCalled();
    s.allow(true); s.updates.complete();
    vi.advanceTimersByTime(250);
    expect(s.refresh).toHaveBeenCalledOnce();
    s.updates.stop();
  });

  test("rechecks eligibility when a queued timer fires", () => {
    const s = scenario();
    s.notify(); s.allow(false);
    vi.advanceTimersByTime(250);
    expect(s.refresh).not.toHaveBeenCalled();
    s.allow(true); s.updates.complete();
    vi.advanceTimersByTime(250);
    expect(s.refresh).toHaveBeenCalledOnce();
    s.updates.stop();
  });

  test("unsubscribes when hidden and catches up after becoming visible", () => {
    const s = scenario();
    s.visible(false);
    expect(s.unsubscribe).toHaveBeenCalledOnce();
    s.notify(); vi.advanceTimersByTime(60_000);
    expect(s.refresh).not.toHaveBeenCalled();
    s.visible(true); vi.advanceTimersByTime(250);
    expect(s.subscribe).toHaveBeenCalledTimes(2);
    expect(s.refresh).toHaveBeenCalledOnce();
    s.updates.stop();
  });

  test("unsubscribes offline and catches up after reconnection", () => {
    const s = scenario();
    s.online(false); vi.advanceTimersByTime(60_000);
    expect(s.unsubscribe).toHaveBeenCalledOnce();
    expect(s.refresh).not.toHaveBeenCalled();
    s.online(true); vi.advanceTimersByTime(250);
    expect(s.subscribe).toHaveBeenCalledTimes(2);
    expect(s.refresh).toHaveBeenCalledOnce();
    s.updates.stop();
  });

  test.each([-60_000, 60_000])("expires using server duration despite browser clock skew %ims", (skew) => {
    const s = scenario();
    vi.advanceTimersByTime(250); s.updates.complete(); s.refresh.mockClear();
    vi.setSystemTime(250 + skew);
    s.updates.expireAt({ startsAt: 2_250, serverNow: 250 });
    vi.advanceTimersByTime(2_249);
    expect(s.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(s.refresh).toHaveBeenCalledOnce();
    s.updates.stop();
  });

  test("wall-clock jumps do not postpone throttled events or displayed expiry", () => {
    const s = scenario();
    s.notify(); vi.advanceTimersByTime(250); s.updates.complete();
    s.updates.expireAt({ startsAt: 2_000, serverNow: 250 });
    vi.setSystemTime(-3_600_000);
    s.notify(); vi.advanceTimersByTime(1_000);
    expect(s.refresh).toHaveBeenCalledTimes(2);
    s.updates.complete();
    vi.setSystemTime(3_600_000);
    vi.advanceTimersByTime(1_000);
    expect(s.refresh).toHaveBeenCalledTimes(3);
    s.updates.stop();
  });

  test("accounts for a delayed read instead of extending the server expiry", () => {
    const s = scenario();
    vi.advanceTimersByTime(250); s.updates.complete(); s.refresh.mockClear();
    vi.advanceTimersByTime(1_000);
    s.updates.expireAt({ startsAt: 6_000, serverNow: 5_000 }, 1_200);
    vi.advanceTimersByTime(249);
    expect(s.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(s.refresh).toHaveBeenCalledOnce();
    s.updates.stop();
  });

  test("an unchanged future session does not push back its existing deadline", () => {
    const s = scenario();
    vi.advanceTimersByTime(250); s.updates.complete(); s.refresh.mockClear();
    s.updates.expireAt({ startsAt: 4_000, serverNow: 250 });
    vi.advanceTimersByTime(1_000);
    s.updates.expireAt({ startsAt: 4_000, serverNow: 500 });
    vi.advanceTimersByTime(2_999);
    expect(s.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(s.refresh).toHaveBeenCalledOnce();
    s.updates.stop();
  });

  test("rearms the same session after an early read and backs off already-due responses", () => {
    const s = scenario();
    vi.advanceTimersByTime(250); s.updates.complete(); s.refresh.mockClear();
    s.updates.expireAt({ startsAt: 2_000, serverNow: 250 });
    vi.advanceTimersByTime(2_000);
    expect(s.refresh).toHaveBeenCalledOnce();
    s.updates.complete();
    s.updates.expireAt({ startsAt: 2_000, serverNow: 1_500 });
    vi.advanceTimersByTime(1_000);
    expect(s.refresh).toHaveBeenCalledTimes(2);
    s.updates.complete();
    s.updates.expireAt({ startsAt: 2_000, serverNow: 3_250 });
    vi.advanceTimersByTime(1_000);
    expect(s.refresh).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1_250);
    expect(s.refresh).toHaveBeenCalledTimes(3);
    s.updates.stop();
  });

  test("persistently stale responses do not turn expiry into continuous polling", () => {
    const s = scenario();
    vi.advanceTimersByTime(250); s.updates.complete(); s.refresh.mockClear();
    s.refresh.mockImplementation(() => {
      s.updates.complete();
      s.updates.expireAt({ startsAt: 0, serverNow: Date.now() });
    });
    s.updates.expireAt({ startsAt: 0, serverNow: 250 });
    vi.advanceTimersByTime(60_000);
    expect(s.refresh.mock.calls.length).toBeGreaterThan(1);
    expect(s.refresh.mock.calls.length).toBeLessThan(10);
    s.updates.stop();
  });

  test("a different first session replaces the obsolete expiry deadline", () => {
    const s = scenario();
    vi.advanceTimersByTime(250); s.updates.complete(); s.refresh.mockClear();
    s.updates.expireAt({ startsAt: 1_000, serverNow: 250 });
    s.updates.expireAt({ startsAt: 3_000, serverNow: 250 });
    vi.advanceTimersByTime(2_999);
    expect(s.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(s.refresh).toHaveBeenCalledOnce();
    s.updates.stop();
  });

  test("empty or failed result props cancel expiry and retain reconciliation", () => {
    const s = scenario();
    vi.advanceTimersByTime(250); s.updates.complete(); s.refresh.mockClear();
    s.updates.expireAt({ startsAt: 1_000, serverNow: 250 });
    s.updates.expireAt(null);
    vi.advanceTimersByTime(29_999);
    expect(s.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(s.refresh).toHaveBeenCalledOnce();
    s.updates.stop();
  });

  test("does not overflow distant starts", () => {
    const s = scenario();
    vi.advanceTimersByTime(250); s.updates.complete(); s.refresh.mockClear();
    s.updates.expireAt({ startsAt: 3_000_000_000, serverNow: 250 });
    vi.advanceTimersByTime(5_000);
    expect(s.refresh).not.toHaveBeenCalled();
    s.updates.stop();
  });

  test("stops timers, subscriptions and late callbacks on departure", () => {
    const s = scenario();
    s.notify(); s.updates.expireAt({ startsAt: 10_000, serverNow: 0 });
    s.updates.stop(); s.updates.stop();
    s.notify(); s.updates.complete(); s.updates.expireAt({ startsAt: 1, serverNow: 0 });
    s.visible(false); s.visible(true); s.online(false); s.online(true);
    vi.advanceTimersByTime(60_000);
    expect(s.refresh).not.toHaveBeenCalled();
    expect(s.unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
