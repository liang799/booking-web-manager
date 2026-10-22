import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { loadSessionFeed } from "@/app/sessions/session-feed-transport";

const fetcher = vi.fn<typeof fetch>();
const page = { sessions: [], nextCursor: "next-page", asOf: "2042-01-01T00:00:00.000Z", upcomingCount: 15, pastCount: 0 };
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", fetcher); });
afterEach(() => vi.unstubAllGlobals());

test("sends a cursor and tab with cookies and validates the paginated response", async () => {
  fetcher.mockResolvedValueOnce(Response.json(page));
  expect(await loadSessionFeed({ tab: "hosting", cursor: "cursor+value" })).toEqual(page);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/sessions/mine?tab=hosting&cursor=cursor%2Bvalue",
    expect.objectContaining({ credentials: "same-origin", cache: "no-store" }));
});

test.each([
  [401, "UNAUTHENTICATED", "unexpected", true],
  [403, "INACTIVE_ACCOUNT", "unexpected", true],
  [503, "SESSION_MANAGEMENT_UNAVAILABLE", "unavailable", false],
] as const)("classifies %s failures", async (status, code, kind, signIn) => {
  fetcher.mockResolvedValueOnce(Response.json({ error: { code } }, { status }));
  await expect(loadSessionFeed({ tab: "joined" })).rejects.toMatchObject({ code, kind, signIn });
});

test("rejects an invalid page instead of rendering a false empty state", async () => {
  fetcher.mockResolvedValueOnce(Response.json({ ...page, nextCursor: 12 }));
  await expect(loadSessionFeed({ tab: "joined" })).rejects.toMatchObject({ code: "UNEXPECTED_RESPONSE" });
});

test("preserves cancellation for an obsolete React Query request", async () => {
  const controller = new AbortController();
  fetcher.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  }));
  const pending = loadSessionFeed({ tab: "joined", signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});
