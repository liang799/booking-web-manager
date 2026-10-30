"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import type { NotificationFilter } from "@/use-cases/notifications/notification-inbox";
import { fetchNotifications, markNotificationRead, type InboxPage, type NotificationItem } from "../transport";
import { NotificationsView } from "./notifications-view";

export function NotificationsClient({ readPage = fetchNotifications, saveRead = markNotificationRead }: {
  readonly readPage?: typeof fetchNotifications;
  readonly saveRead?: typeof markNotificationRead;
}) {
  const router = useRouter();
  const [query, setQuery] = useState<{ filter: NotificationFilter; before: InboxPage["nextCursor"]; revision: number }>({ filter: "all", before: null, revision: 0 });
  const [page, setPage] = useState<InboxPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => new Date().toISOString());
  const refresh = useCallback(() => setQuery((value) => ({ ...value, before: null, revision: value.revision + 1 })), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    if (!query.before) setPage(null);
    readPage(query.filter, query.before, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setPage((previous) => ({ ...result, items: query.before && previous ? [...previous.items, ...result.items.filter((item) => !previous.items.some((old) => old.id === item.id))] : result.items }));
      setNow(new Date().toISOString());
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Notifications could not be loaded.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, readPage]);

  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  async function markRead(id: string, destination?: string) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveRead(id);
      setNotice(id === "all" ? "All notifications marked as read." : "Notification marked as read.");
      if (destination) router.push(destination);
      else refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Read status could not be saved.");
    } finally { setSaving(false); }
  }

  function open(item: NotificationItem, event: MouseEvent<HTMLAnchorElement>) {
    if (item.readAt || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    void markRead(item.id, item.url);
  }

  return <NotificationsView items={page?.items ?? []} unreadCount={page?.unreadCount ?? 0} filter={query.filter} now={now}
    loading={loading} saving={saving} error={error} notice={notice} hasMore={Boolean(page?.nextCursor)}
    onFilter={(filter) => setQuery((value) => ({ filter, before: null, revision: value.revision + 1 }))}
    onRefresh={refresh} onLoadMore={() => setQuery((value) => ({ ...value, before: page?.nextCursor ?? null, revision: value.revision + 1 }))}
    onMarkRead={(id) => { void markRead(id); }} onOpen={open} />;
}
