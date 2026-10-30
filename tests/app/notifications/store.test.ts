import { expect, test, vi } from "vitest";
import { NotificationStore } from "@/app/notifications/notification-store";
import {
  NotificationAccessError,
  type InboxPage,
} from "@/app/notifications/transport";

const first: InboxPage = {
  items: [
    {
      id: "one",
      category: "groups",
      title: "Invitation",
      body: "",
      url: "/groups",
      createdAt: "2026-10-30T00:00:00.000Z",
    },
  ],
  nextCursor: null,
  retentionCutoff: "2026-09-30T00:00:00.000Z",
};
test("a failed background refresh preserves the last successful page", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(first)
    .mockRejectedValueOnce(Error("offline"));
  const store = new NotificationStore(read);
  await store.refresh("all");
  await store.refresh("all");
  expect(store.snapshot().pages.all).toEqual(first);
  expect(store.snapshot().errors.all).toBe("offline");
});
test("one followup catches hints arriving during a pending read", async () => {
  let finish: (page: InboxPage) => void = () => {};
  const read = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<InboxPage>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(first);
  const store = new NotificationStore(read);
  const pending = store.refresh("all");
  await store.refresh("all");
  await store.refresh("all");
  finish(first);
  await pending;
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  expect(store.snapshot().pages.all?.items).toEqual(first.items);
});
test("access loss clears all account data and late responses cannot restore it", async () => {
  let finish: (page: InboxPage) => void = () => {};
  const read = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<InboxPage>((resolve) => {
          finish = resolve;
        }),
    )
    .mockRejectedValueOnce(new NotificationAccessError());
  const store = new NotificationStore(read);
  const pending = store.refresh("groups");
  await store.refresh("all");
  finish(first);
  await pending;
  expect(store.snapshot()).toMatchObject({ pages: {}, forbidden: true });
  await store.refreshVisible();
  expect(read).toHaveBeenCalledTimes(2);
});
test("a fresh server cutoff prunes every inactive category and switching back reconciles it", async () => {
  const old = {
    ...first,
    retentionCutoff: "2026-08-01T00:00:00.000Z",
    items: [
      {
        ...first.items[0],
        id: "expired",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ],
  };
  let groupReads = 0;
  const read = vi.fn(async (filter: string) =>
    filter === "groups" && groupReads++ === 0 ? old : first,
  );
  const store = new NotificationStore(read);
  await store.refresh("groups");
  await store.refresh("all");
  expect(store.snapshot().pages.groups?.items).toEqual([]);
  store.activate("groups");
  await vi.waitFor(() => expect(groupReads).toBe(2));
  await vi.waitFor(() =>
    expect(store.snapshot().pages.groups?.items[0]?.id).toBe("one"),
  );
});
