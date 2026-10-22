import { beforeEach, expect, test, vi } from "vitest";
import { DomainError } from "@/domain";
import { GET } from "@/app/api/sessions/mine/route";
import { getSessionFeedDependencies } from "@/app/sessions/session-feed-server-dependencies";
import { parseSessionFeedInput, toSessionFeedResponse } from "@/app/sessions/session-feed-pagination";
import { sessionFeedResponseSchema } from "@/app/sessions/session-feed-contract";
import type { SessionFeedPage } from "@/use-cases/sessions/ListSessionFeed";

vi.mock("@/app/sessions/session-feed-server-dependencies", () => ({ getSessionFeedDependencies: vi.fn() }));
const userId = "10000000-0000-4000-8000-000000000001";
const otherUserId = "10000000-0000-4000-8000-000000000002";
const sessionId = "20000000-0000-4000-8000-000000000001";
const asOf = new Date("2040-01-01T00:00:00Z");
const startAt = new Date("2040-01-02T00:00:00Z");
const page: SessionFeedPage = { sessions: [], next: { section: "upcoming", startAt, sessionId }, asOf, upcomingCount: 15, pastCount: 3 };
const authenticate = vi.fn();
const list = vi.fn();
const request = (query = "tab=joined") => new Request(`https://booking.test/api/sessions/mine?${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  authenticate.mockResolvedValue(userId);
  list.mockResolvedValue(page);
  vi.mocked(getSessionFeedDependencies).mockResolvedValue({ authenticate, sessionFeed: { list } });
});

test("uses only the authenticated identity and returns an uncached validated page", async () => {
  const response = await GET(request("tab=hosting"));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(sessionFeedResponseSchema.safeParse(await response.json()).success).toBe(true);
  expect(list).toHaveBeenCalledExactlyOnceWith(userId, { tab: "hosting" });
});

test("authenticates before parsing and never reads data for an anonymous caller", async () => {
  authenticate.mockResolvedValue(null);
  expect((await GET(request("cursor=bad"))).status).toBe(401);
  expect(list).not.toHaveBeenCalled();
});

test.each([
  "tab=someone-else", "tab=joined&userId=another-user", "tab=joined&tab=hosting", "cursor=bad",
])("rejects malformed or identity-bearing query: %s", async (query) => {
  expect((await GET(request(query))).status).toBe(400);
  expect(list).not.toHaveBeenCalled();
});

test("the cursor preserves its tab, user and time boundary and rejects reuse across accounts or tabs", () => {
  const cursor = toSessionFeedResponse(page, userId, "joined").nextCursor;
  expect(parseSessionFeedInput(request(`tab=joined&cursor=${cursor}`), userId))
    .toEqual({ tab: "joined", asOf, after: page.next });
  expect(() => parseSessionFeedInput(request(`tab=hosting&cursor=${cursor}`), userId)).toThrow();
  expect(() => parseSessionFeedInput(request(`tab=joined&cursor=${cursor}`), otherUserId)).toThrow();
});

test("inactive accounts receive no page, and database errors remain opaque", async () => {
  list.mockRejectedValueOnce(new DomainError("INACTIVE_ACCOUNT", "An inactive account cannot view sessions"));
  expect((await GET(request())).status).toBe(403);
  list.mockRejectedValueOnce(new Error("secret database connection details"));
  const failed = await GET(request());
  expect(failed.status).toBe(500);
  expect(await failed.text()).not.toContain("secret");
});
