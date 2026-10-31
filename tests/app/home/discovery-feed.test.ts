import { afterEach, expect, test, vi } from "vitest";
import { readHomeDiscoveryPage } from "@/app/home/discovery-feed";

const session = { sessionId: "10000000-0000-4000-8000-000000000001", venueName: "Bishan Sports Hall", sport: "Tennis", region: "Central", startAt: "2035-05-12T10:00:00.000Z", endAt: "2035-05-12T12:00:00.000Z", totalSlots: 4, bookingShareCents: 1000 };
afterEach(() => vi.unstubAllGlobals());

test("reads the discovery cursor without changing the Home URL and retains server expiry timing", async () => {
  const fetch = vi.fn(async () => Response.json({ items: [session], nextCursor: "next-page" }, { headers: { "X-Server-Time": "1793300000000" } }));
  vi.stubGlobal("fetch", fetch);
  const result = await readHomeDiscoveryPage("opaque+/cursor=", new AbortController().signal);
  expect(fetch).toHaveBeenCalledWith("/api/sessions?cursor=opaque%2B%2Fcursor%3D", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
  expect(result.page).toEqual({ items: [session], nextCursor: "next-page" });
  expect(result.expiry).toEqual({ startsAt: Date.parse(session.startAt), serverNow: 1793300000000 });
  expect(result.receivedAt).toBeGreaterThanOrEqual(0);
});

test("unavailable discovery rejects for React Query instead of becoming an empty feed", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
  await expect(readHomeDiscoveryPage(null, new AbortController().signal)).rejects.toThrow("unavailable");
});

test("an aborted query never produces a stale page", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(readHomeDiscoveryPage(null, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch).not.toHaveBeenCalled();
});
