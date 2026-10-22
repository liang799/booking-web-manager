import { afterEach, describe, expect, test, vi } from "vitest";
import { DISCOVERY_RECONCILE_MS, startDiscoveryUpdates } from "@/app/discover/_components/discovery-updates";

afterEach(() => vi.useRealTimers());

function scenario() {
  vi.useFakeTimers();
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
    vi.advanceTimersByTime(DISCOVERY_RECONCILE_MS - 1);
    expect(s.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(251);
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

  test("expires a displayed session without requiring a database update", () => {
    const s = scenario();
    s.updates.expireAt(2_000);
    vi.advanceTimersByTime(2_249);
    expect(s.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(s.refresh).toHaveBeenCalledOnce();
    s.updates.complete(); s.updates.expireAt(2_000);
    vi.advanceTimersByTime(5_000);
    expect(s.refresh).toHaveBeenCalledOnce();
    s.updates.expireAt(8_000); vi.advanceTimersByTime(1_000);
    expect(s.refresh).toHaveBeenCalledTimes(2);
    s.updates.stop();
  });

  test("cancels obsolete expiry timers and does not overflow distant starts", () => {
    const s = scenario();
    s.updates.expireAt(1_000); s.updates.expireAt(undefined);
    vi.advanceTimersByTime(2_000);
    expect(s.refresh).not.toHaveBeenCalled();
    s.updates.expireAt(3_000_000_000);
    vi.advanceTimersByTime(5_000);
    expect(s.refresh).not.toHaveBeenCalled();
    s.updates.stop();
  });

  test("stops timers, subscriptions and late callbacks on departure", () => {
    const s = scenario();
    s.notify(); s.updates.expireAt(10_000);
    s.updates.stop(); s.updates.stop();
    s.notify(); s.updates.complete(); s.updates.expireAt(1);
    s.visible(false); s.visible(true); s.online(false); s.online(true);
    vi.advanceTimersByTime(60_000);
    expect(s.refresh).not.toHaveBeenCalled();
    expect(s.unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
