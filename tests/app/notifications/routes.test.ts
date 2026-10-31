import { beforeEach, expect, test, vi } from "vitest";
import { DomainError } from "@/domain";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), list: vi.fn(), markRead: vi.fn() }));
vi.mock("@/app/notifications/server-dependencies", () => ({
  getNotificationDependencies: async () => ({ authenticate: mocks.authenticate, inbox: mocks }),
}));
import { GET } from "@/app/api/notifications/route";

beforeEach(() => { vi.clearAllMocks(); mocks.authenticate.mockResolvedValue("10000000-0000-4000-8000-000000000001"); });

test("lists the authenticated actor with category filtering and a retention cutoff", async () => {
  mocks.list.mockResolvedValue({ items: [{ id: "notice", createdAt: new Date("2026-10-29T01:00:00Z") }], retentionCutoff: new Date("2026-09-29T01:00:00Z"), nextCursor: null });
  const result = await GET(new Request("http://localhost/api/notifications?filter=groups&userId=other"));
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(mocks.list).toHaveBeenCalledExactlyOnceWith("10000000-0000-4000-8000-000000000001", "groups", undefined);
  const body = await result.json();
  expect(body).toMatchObject({ retentionCutoff: "2026-09-29T01:00:00.000Z", items: [{ createdAt: "2026-10-29T01:00:00.000Z" }] });
  expect(body).not.toHaveProperty("unreadCount");
  expect(body.items[0]).not.toHaveProperty("readAt");
});

test.each(["filter=unread", "filter=unknown", "before=2026-10-29T00:00:00Z", "before=invalid&id=invalid"])("rejects invalid query %s", async (query) => {
  expect((await GET(new Request(`http://localhost/api/notifications?${query}`))).status).toBe(400);
  expect(mocks.list).not.toHaveBeenCalled();
});

test("inactive accounts cannot access the inbox and infrastructure errors stay opaque", async () => {
  mocks.list.mockRejectedValueOnce(new DomainError("INACTIVE_ACCOUNT", "Inactive account"));
  expect((await GET(new Request("http://localhost/api/notifications"))).status).toBe(403);
  mocks.list.mockRejectedValueOnce(new Error("secret database connection"));
  const result = await GET(new Request("http://localhost/api/notifications"));
  expect(result.status).toBe(500);
  expect(await result.text()).not.toContain("secret");
});
