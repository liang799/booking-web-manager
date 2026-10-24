import { afterEach, expect, test, vi } from "vitest";
import { readDiscovery } from "@/app/discover/client-read";

const item = {
  sessionId: "11111111-1111-4111-8111-111111111111", venueName: "Jurong Sports Hall",
  sport: "Badminton", region: "West", startAt: "2040-01-02T10:00:00.000Z",
  endAt: "2040-01-02T12:00:00.000Z", totalSlots: 3, bookingShareCents: 333,
};
const page = { items: [item], nextCursor: "opaque-cursor" };
const serverNow = Date.parse(item.startAt) - 5_000;
const response = (body: unknown = page, time = String(serverNow)) =>
  Response.json(body, { headers: { "X-Server-Time": time } });

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

test("reads the committed filters and cursor without caching or using the browser wall clock", async () => {
  vi.useFakeTimers(); vi.setSystemTime(serverNow + 3_600_000);
  const fetch = vi.fn().mockResolvedValue(response()); vi.stubGlobal("fetch", fetch);
  const result = await readDiscovery("q=Jurong&cursor=opaque-cursor", new AbortController().signal);
  expect(fetch).toHaveBeenCalledWith("/api/sessions?q=Jurong&cursor=opaque-cursor", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
  expect(result).toEqual({ outcome: { status: "ready", page }, expiry: { startsAt: Date.parse(item.startAt), serverNow } });
  expect(vi.getTimerCount()).toBe(0);
});

test("empty results clear expiry and an empty query needs no question mark", async () => {
  const fetch = vi.fn().mockResolvedValue(response({ items: [], nextCursor: null })); vi.stubGlobal("fetch", fetch);
  expect(await readDiscovery("", new AbortController().signal)).toEqual({ outcome: { status: "ready", page: { items: [], nextCursor: null } }, expiry: null });
  expect(fetch).toHaveBeenCalledWith("/api/sessions", expect.any(Object));
});

test.each(["", "NaN", "Infinity", "-1", "1.5"])("rejects invalid server timing %j instead of trusting the device clock", async (time) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(page, time)));
  expect(await readDiscovery("", new AbortController().signal)).toEqual({ outcome: { status: "error", kind: "unexpected" }, expiry: null });
});

test.each([
  { items: [{ ...item, startAt: "invalid" }], nextCursor: null },
  { items: [{ ...item, bookingShareCents: 3.5 }], nextCursor: null },
  { items: [{ ...item, totalSlots: 0 }], nextCursor: null },
  { items: [item], nextCursor: 4 },
  { items: Array.from({ length: 21 }, () => item), nextCursor: null },
])("rejects malformed listing responses before rendering", async (body) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body)));
  expect(await readDiscovery("", new AbortController().signal)).toEqual({ outcome: { status: "error", kind: "unexpected" }, expiry: null });
});

test.each([[503, "unavailable"], [500, "unexpected"], [400, "unexpected"]])("maps HTTP %i to the existing error screen", async (status, kind) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private error text", { status: Number(status) })));
  expect(await readDiscovery("", new AbortController().signal)).toEqual({ outcome: { status: "error", kind }, expiry: null });
});

test("network failures settle as an error result so the caller can release its scheduler", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
  expect(await readDiscovery("", new AbortController().signal)).toEqual({ outcome: { status: "error", kind: "unexpected" }, expiry: null });
});

function stallFetchUntilAbort() {
  vi.stubGlobal("fetch", vi.fn((_url: string, { signal }: RequestInit) => new Promise<Response>((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  })));
}

test("a stalled read times out and allows the next read to succeed", async () => {
  vi.useFakeTimers(); stallFetchUntilAbort();
  const read = readDiscovery("", new AbortController().signal);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await read).toEqual({ outcome: { status: "error", kind: "unexpected" }, expiry: null });
  expect(vi.getTimerCount()).toBe(0);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
  expect((await readDiscovery("", new AbortController().signal))?.outcome.status).toBe("ready");
});

test("navigation or unmount cancellation aborts transport without an error result", async () => {
  vi.useFakeTimers(); stallFetchUntilAbort();
  const controller = new AbortController();
  const read = readDiscovery("", controller.signal); controller.abort();
  expect(await read).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

test("an already cancelled owner never starts a request", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const controller = new AbortController(); controller.abort();
  expect(await readDiscovery("", controller.signal)).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
