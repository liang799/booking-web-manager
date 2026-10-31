"use client";
import { useEffect, useState } from "react";
import type { NotificationFilter } from "@/use-cases/notifications/notification-inbox";
import { NotificationProvider, useNotificationPage } from "../provider";
import { type NotificationItem, fetchNotifications } from "../transport";
import { NotificationsView } from "./notifications-view";

const noRealtime = () => () => {};
/** Custom transport is used only by deterministic browser stories; production uses the shared signed-in provider. */
export function NotificationsClient({
  readPage,
}: {
  readPage?: typeof fetchNotifications;
}) {
  if (readPage)
    return (
      <NotificationProvider
        userId="notification-preview"
        readPage={readPage}
        subscribe={noRealtime}
      >
        <Inbox />
      </NotificationProvider>
    );
  return <Inbox />;
}
function Inbox() {
  const [filter, setFilter] = useState<NotificationFilter>("all"),
    [notice, setNotice] = useState("");
  const { store, reads, changed, snapshot, page } = useNotificationPage(filter);
  useEffect(() => {
    if (page?.items[0]) {
      reads.visit(page.items[0]);
      changed();
    }
  }, [reads, Boolean(page)]); // A visit records the displayed head once, never an arriving Broadcast.
  function mark(id: string) {
    if (id === "all")
      reads.markAll(snapshot.pages.all?.items[0] ?? page?.items[0]);
    else {
      const item = page?.items.find((x) => x.id === id);
      if (item) reads.markRead(item);
    }
    changed();
    setNotice(
      id === "all"
        ? "All notifications marked as read on this browser."
        : "Notification marked as read on this browser.",
    );
  }
  function open(item: NotificationItem) {
    reads.markRead(item);
    changed();
  }
  return (
    <NotificationsView
      items={(page?.items ?? []).map((item) => ({
        ...item,
        read: reads.isRead(item),
      }))}
      filter={filter}
      now={new Date().toISOString()}
      loading={!snapshot.forbidden && (snapshot.loading[filter] ?? !page)}
      error={
        snapshot.forbidden
          ? "Sign in again to see your notifications."
          : snapshot.errors[filter]
      }
      notice={notice}
      hasMore={Boolean(page?.nextCursor)}
      onFilter={setFilter}
      onRefresh={() => void store.refreshVisible()}
      onLoadMore={() => void store.older(filter)}
      onMarkRead={mark}
      onOpen={open}
    />
  );
}
