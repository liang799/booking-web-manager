"use client";

import { Bell, Check, ChevronRight, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NotificationFilter } from "@/use-cases/notifications/notification-inbox";
import { notificationDate, notificationTime } from "../presentation";
import type { NotificationItem } from "../transport";

const filters = ["all", "unread", "bookings", "groups", "payments", "system"] as const;

export interface NotificationsViewProps {
  readonly items: readonly NotificationItem[];
  readonly unreadCount: number;
  readonly filter: NotificationFilter;
  readonly now: string;
  readonly loading?: boolean;
  readonly saving?: boolean;
  readonly error?: string | null;
  readonly notice?: string;
  readonly hasMore?: boolean;
  readonly onFilter: (filter: NotificationFilter) => void;
  readonly onRefresh: () => void;
  readonly onLoadMore: () => void;
  readonly onMarkRead: (id: string) => void;
  readonly onOpen: (item: NotificationItem, event: MouseEvent<HTMLAnchorElement>) => void;
}

export function NotificationsView({ items, unreadCount, filter, now, loading, saving, error, notice, hasMore, onFilter, onRefresh, onLoadMore, onMarkRead, onOpen }: NotificationsViewProps) {
  const groups = new Map<string, { date: ReturnType<typeof notificationDate>; items: NotificationItem[] }>();
  for (const item of items) {
    const date = notificationDate(item.createdAt, now);
    const group = groups.get(date.key) ?? { date, items: [] };
    group.items.push(item);
    groups.set(date.key, group);
  }
  return (
    <div className="mx-auto max-w-[1440px] px-6 pb-16 pt-3 md:px-10 md:pt-12 lg:px-16">
      <p className="hidden text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground md:block">Notifications /</p>
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 md:mt-5">
        <h1 className="text-3xl font-semibold tracking-[-0.045em] md:text-5xl">Notifications</h1>
        <div className="flex items-center gap-5 text-sm">
          <span aria-live="polite" className="inline-flex items-center gap-2 text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />{unreadCount} unread</span>
          <button type="button" disabled={unreadCount === 0 || saving || loading} onClick={() => onMarkRead("all")} className="min-h-11 text-muted-foreground underline decoration-border underline-offset-[6px] outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">{saving ? "Saving…" : "Mark all as read"}</button>
          <Button variant="ghost" size="icon" aria-label="Refresh notifications" disabled={loading || saving} onClick={onRefresh}><RefreshCw className="h-4 w-4" aria-hidden /></Button>
        </div>
      </div>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">Your session updates, all in one place.</p>

      <div role="group" aria-label="Filter notifications" className="mt-7 flex gap-6 overflow-x-auto border-b md:mt-12 md:gap-9">
        {filters.map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => onFilter(value)} className={cn("relative flex min-h-[52px] shrink-0 items-center gap-2 border-b-2 px-0.5 text-sm capitalize outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", filter === value ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
          {value}{value === "unread" && unreadCount > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]" aria-hidden>{unreadCount}</span>}
        </button>)}
      </div>

      <p className="sr-only" role="status">{loading ? "Loading notifications" : notice}</p>
      {error && <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-4 text-sm"><p>{error}</p><Button variant="outline" onClick={onRefresh} disabled={loading}>Try again</Button></div>}
      <div aria-busy={loading || saving}>
        {loading && items.length === 0 ? <div className="space-y-6 py-12" aria-hidden>{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-lg bg-muted/50 motion-safe:animate-pulse" />)}</div>
          : !error && items.length === 0 ? <div className="flex flex-col items-center py-20 text-center">
            <Bell className="mb-5 h-7 w-7 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <h2 className="text-xl font-medium">{filter === "unread" ? "You're all caught up" : filter === "all" ? "No notifications yet" : `No ${filter === "bookings" ? "booking" : filter === "groups" ? "group" : filter === "payments" ? "payment" : "system"} notifications yet`}</h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{filter === "unread" ? "New updates will appear here when they arrive." : "Updates will appear here when there's something to share."}</p>
          </div> : [...groups.values()].map(({ date, items: datedItems }) => <section key={date.key} aria-label={`${date.day} ${date.month}`} className="border-b py-7 last:border-b-0 md:grid md:grid-cols-[144px_minmax(0,1fr)] md:py-10 lg:grid-cols-[184px_minmax(0,1fr)]">
            <div className="mb-3 flex items-baseline gap-3 md:mb-0 md:block md:border-r md:pr-6">
              <span className="text-3xl font-semibold leading-none tracking-[-0.05em] md:text-6xl">{date.day}</span>
              <span className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground md:mt-3 md:block md:text-xs">{date.month}</span>
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground md:ml-0 md:mt-6 md:block">{date.label}</span>
            </div>
            <ul className="divide-y md:pl-4">
              {datedItems.map((item) => <li key={item.id} className="group relative flex items-center gap-1 py-4 first:pt-2 last:pb-0 md:gap-3 md:py-5">
                <span className={cn("absolute left-0 top-10 h-1.5 w-1.5 rounded-full bg-foreground", item.readAt && "invisible")} aria-hidden />
                <Link href={item.url} onClick={(event) => onOpen(item, event)} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 rounded-md py-1 pl-5 outline-none focus-visible:ring-2 focus-visible:ring-ring md:pl-6">
                  <span className="min-w-0 flex-1 basis-[220px]">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{item.category === "bookings" ? "Booking" : item.category}</span>
                    <span className={cn("mt-1 block text-base font-semibold tracking-tight md:text-lg", item.readAt && "font-medium text-muted-foreground")}>{!item.readAt && <span className="sr-only">Unread: </span>}{item.title}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{item.body}</span>
                  </span>
                  <time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })} className="shrink-0 text-xs text-muted-foreground">{notificationTime(item.createdAt, now)}</time>
                  <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground md:block" aria-hidden />
                </Link>
                {!item.readAt && <Button variant="ghost" size="icon" disabled={saving} onClick={() => onMarkRead(item.id)} aria-label={`Mark as read: ${item.title}`} className="h-11 w-11 shrink-0 text-muted-foreground"><Check className="h-4 w-4" aria-hidden /></Button>}
              </li>)}
            </ul>
          </section>)}
        {hasMore && <div className="mt-8 text-center"><Button variant="outline" onClick={onLoadMore} disabled={loading || saving}>{loading ? "Loading…" : "Load older notifications"}</Button></div>}
      </div>
    </div>
  );
}
