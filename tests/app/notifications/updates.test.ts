import { afterEach, expect, test, vi } from "vitest";
import { startNotificationUpdates } from "@/app/notifications/updates";

afterEach(() => vi.useRealTimers());
function surface() {
  const document = Object.assign(new EventTarget(), {
    visibilityState: "visible" as DocumentVisibilityState,
  });
  const window = new EventTarget();
  return { document, window };
}
test("coalesces hints, retains an in-flight hint, and polls only visible online pages", async () => {
  vi.useFakeTimers();
  const surfaces = surface();
  let hint = () => {};
  let finish = () => {};
  const refresh = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const unsubscribe = vi.fn();
  const stop = startNotificationUpdates({
    ...surfaces,
    online: () => true,
    subscribe: (invalidate) => {
      hint = invalidate;
      return unsubscribe;
    },
    refresh,
  });
  hint();
  hint();
  await vi.advanceTimersByTimeAsync(250);
  expect(refresh).toHaveBeenCalledTimes(1);
  hint();
  finish();
  await vi.advanceTimersByTimeAsync(1000);
  expect(refresh).toHaveBeenCalledTimes(2);
  finish();
  surfaces.document.visibilityState = "hidden";
  surfaces.document.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(120_000);
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  surfaces.document.visibilityState = "visible";
  surfaces.document.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(250);
  expect(refresh).toHaveBeenCalledTimes(3);
  finish();
  stop();
});
test("subscription setup failure keeps HTTP recovery available", async () => {
  vi.useFakeTimers();
  const surfaces = surface();
  const refresh = vi.fn(async () => {});
  const stop = startNotificationUpdates({
    ...surfaces,
    online: () => true,
    subscribe: () => {
      throw Error("Realtime unavailable");
    },
    refresh,
  });
  await vi.advanceTimersByTimeAsync(250);
  expect(refresh).toHaveBeenCalledOnce();
  stop();
});
