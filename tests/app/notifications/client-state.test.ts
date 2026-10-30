import { expect, test } from "vitest";
import { reconcileNotificationPages } from "@/app/notifications/client-state";
import { LocalNotificationReads } from "@/app/notifications/local-reads";
import type {
  InboxPage,
  NotificationItem,
} from "@/app/notifications/transport";

const item = (n: number): NotificationItem => ({
  id: `id-${n}`,
  category: "groups",
  title: `Notice ${n}`,
  body: "",
  url: "/groups",
  createdAt: new Date(Date.UTC(2026, 9, 30, 0, n)).toISOString(),
});
const page = (items: NotificationItem[], more = false): InboxPage => ({
  items,
  nextCursor: more
    ? { id: items.at(-1)!.id, createdAt: items.at(-1)!.createdAt }
    : null,
  retentionCutoff: "2026-09-30T00:00:00Z",
});
test("recovery follows more than one new page to overlap without skipping the middle", async () => {
  const all = Array.from({ length: 95 }, (_, i) => item(95 - i));
  const old = page(all.slice(70, 90), true);
  const calls: (string | undefined)[] = [];
  const result = await reconcileNotificationPages(old, async (before) => {
    calls.push(before?.id);
    const start = before ? all.findIndex((x) => x.id === before.id) + 1 : 0;
    return page(all.slice(start, start + 30), start + 30 < all.length);
  });
  expect(calls).toHaveLength(3);
  expect(result.items.map((x) => x.id)).toEqual(
    all.slice(0, 90).map((x) => x.id),
  );
  expect(result.nextCursor).toEqual(old.nextCursor);
});
test("retention cutoff removes cached tail messages even when the first fresh page overlaps", async () => {
  const expired = { ...item(0), createdAt: "2026-09-01T00:00:00Z" };
  const result = await reconcileNotificationPages(
    page([item(2), expired]),
    async () => page([item(3), item(2)]),
  );
  expect(result.items.map((x) => x.id)).toEqual(["id-3", "id-2"]);
});

test("recovery reaches the end without overlap and replaces the stale cache", async () => {
  const fresh = Array.from({ length: 65 }, (_, index) => item(65 - index));
  const previous = page([item(100), item(99)], true);
  const original = structuredClone(previous);
  const cursors: InboxPage["nextCursor"][] = [];

  const result = await reconcileNotificationPages(previous, async (before) => {
    cursors.push(before);
    const start = before ? fresh.findIndex((entry) => entry.id === before.id) + 1 : 0;
    return page(fresh.slice(start, start + 30), start + 30 < fresh.length);
  });

  expect(cursors).toEqual([null, page(fresh.slice(0, 30), true).nextCursor, page(fresh.slice(30, 60), true).nextCursor]);
  expect(result.items).toEqual(fresh);
  expect(result.nextCursor).toBeNull();
  expect(previous).toEqual(original);
});

test("an entirely expired cache is replaced by the fresh page with its continuation intact", async () => {
  const expired = { ...item(100), createdAt: "2026-09-01T00:00:00Z" };
  const previous = page([expired], true);
  const fresh = page([item(3), item(2)], true);
  const cursors: InboxPage["nextCursor"][] = [];

  const result = await reconcileNotificationPages(previous, async (before) => {
    cursors.push(before);
    return fresh;
  });

  expect(cursors).toEqual([null]);
  expect(result).toEqual(fresh);
  expect(result.nextCursor).not.toEqual(previous.nextCursor);
  expect(previous.items).toEqual([expired]);
});

test("an empty authoritative inbox clears cached items and their old continuation", async () => {
  const previous = page([item(2)], true);
  const result = await reconcileNotificationPages(previous, async () => page([]));

  expect(result.items).toEqual([]);
  expect(result.nextCursor).toBeNull();
  expect(previous.items).toEqual([item(2)]);
});
test("local read state is per account and receipt does not mark notifications read", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
  };
  const first = new LocalNotificationReads("one", storage);
  first.markRead(item(2));
  expect(first.isRead(item(2))).toBe(true);
  expect(first.isRead(item(3))).toBe(false);
  expect(new LocalNotificationReads("two", storage).isRead(item(2))).toBe(
    false,
  );
  first.visit(item(2));
  expect(first.hasNew(item(3))).toBe(true);
  expect(first.isRead(item(3))).toBe(false);
});
test("unavailable browser storage does not stop local reads", () => {
  const reads = new LocalNotificationReads("one", {
    getItem: () => {
      throw Error("denied");
    },
    setItem: () => {
      throw Error("denied");
    },
  });
  reads.markRead(item(1));
  expect(reads.isRead(item(1))).toBe(true);
});
test("clearing local storage resets read styling on the next storage event", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
  };
  const reads = new LocalNotificationReads("one", storage);
  reads.markRead(item(2));
  values.clear();
  reads.reload();
  expect(reads.isRead(item(2))).toBe(false);
});
test("watermarks store only IDs and timestamps, normalize legacy message copies, and expire", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
  };
  const reads = new LocalNotificationReads("one", storage);
  reads.visit(item(2));
  reads.markAll(item(2));
  expect(values.get(reads.key)).not.toContain("Notice 2");
  expect(values.get(reads.key)).not.toContain("/groups");
  storage.setItem(
    reads.key,
    JSON.stringify({ read: {}, visited: item(2), through: item(2) }),
  );
  reads.reload();
  reads.prune("2026-10-01T00:00:00.000Z");
  expect(values.get(reads.key)).not.toContain("Notice 2");
  reads.prune("2026-11-01T00:00:00.000Z");
  expect(JSON.parse(values.get(reads.key)!)).toEqual({ read: {} });
});
