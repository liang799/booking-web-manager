import { beforeEach, expect, test, vi } from "vitest";
import { DomainError } from "@/domain";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), list: vi.fn(), markRead: vi.fn() }));
vi.mock("@/app/notifications/server-dependencies", () => ({
  getNotificationDependencies: async () => ({ authenticate: mocks.authenticate, inbox: mocks }),
}));
import { GET, PATCH } from "@/app/api/notifications/route";

beforeEach(() => { vi.clearAllMocks(); mocks.authenticate.mockResolvedValue("10000000-0000-4000-8000-000000000001"); });

test("lists only the authenticated actor with a validated filter and serializes dates", async () => {
  mocks.list.mockResolvedValue({ items: [{ id: "notice", createdAt: new Date("2026-10-29T01:00:00Z"), readAt: null }], unreadCount: 3, nextCursor: null });
  const result = await GET(new Request("http://localhost/api/notifications?filter=unread&userId=other"));
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(mocks.list).toHaveBeenCalledExactlyOnceWith("10000000-0000-4000-8000-000000000001", "unread", undefined);
  expect(await result.json()).toMatchObject({ unreadCount: 3, items: [{ createdAt: "2026-10-29T01:00:00.000Z" }] });
});

test.each(["filter=unknown", "before=2026-10-29T00:00:00Z", "before=invalid&id=invalid"])("rejects invalid query %s", async (query) => {
  expect((await GET(new Request(`http://localhost/api/notifications?${query}`))).status).toBe(400);
  expect(mocks.list).not.toHaveBeenCalled();
});

test("mark all uses the authenticated actor and no-store", async () => {
  const result = await PATCH(new Request("http://localhost/api/notifications", { method: "PATCH", body: JSON.stringify({ id: "all" }) }));
  expect(result.status).toBe(204);
  expect(mocks.markRead).toHaveBeenCalledExactlyOnceWith("10000000-0000-4000-8000-000000000001", "all");
});

test("normalizes an uppercase notification UUID before marking it read", async () => {
  const id = "ABCDEFAB-0000-4000-8000-ABCDEFABCDEF";
  const result = await PATCH(new Request("http://localhost/api/notifications", { method: "PATCH", body: JSON.stringify({ id }) }));
  expect(result.status).toBe(204);
  expect(mocks.markRead).toHaveBeenCalledExactlyOnceWith("10000000-0000-4000-8000-000000000001", id.toLowerCase());
});

test("rejects recipient spoofing in a mutation", async () => {
  const result = await PATCH(new Request("http://localhost/api/notifications", { method: "PATCH", body: JSON.stringify({ id: "all", userId: "other" }) }));
  expect(result.status).toBe(400);
  expect(mocks.markRead).not.toHaveBeenCalled();
});

test("inactive accounts cannot access the inbox and infrastructure errors stay opaque", async () => {
  mocks.list.mockRejectedValueOnce(new DomainError("INACTIVE_ACCOUNT", "Inactive account"));
  expect((await GET(new Request("http://localhost/api/notifications"))).status).toBe(403);
  mocks.list.mockRejectedValueOnce(new Error("secret database connection"));
  const result = await GET(new Request("http://localhost/api/notifications"));
  expect(result.status).toBe(500);
  expect(await result.text()).not.toContain("secret");
});
