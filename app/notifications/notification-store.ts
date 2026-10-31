import type { NotificationFilter } from "@/use-cases/notifications/notification-inbox";
import { reconcileNotificationPages } from "./client-state";
import {
  fetchNotifications,
  NotificationAccessError,
  type InboxPage,
} from "./transport";

export interface NotificationSnapshot {
  readonly pages: Partial<Record<NotificationFilter, InboxPage>>;
  readonly loading: Partial<Record<NotificationFilter, boolean>>;
  readonly errors: Partial<Record<NotificationFilter, string>>;
  readonly forbidden: boolean;
}
/** One cache/coordinator per authenticated account, shared by the shell and inbox. */
export class NotificationStore {
  private value: NotificationSnapshot = {
    pages: {},
    loading: {},
    errors: {},
    forbidden: false,
  };
  private listeners = new Set<() => void>();
  private requests = new Map<NotificationFilter, AbortController>();
  private pending = new Set<NotificationFilter>();
  private active: NotificationFilter = "all";
  constructor(private readonly read = fetchNotifications) {}
  snapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(value: Partial<NotificationSnapshot>) {
    this.value = { ...this.value, ...value };
    for (const listener of this.listeners) listener();
  }
  private setPage(filter: NotificationFilter, page: InboxPage) {
    const current = { ...this.value.pages, [filter]: page };
    const cutoff = Object.values(current).reduce(
      (latest, value) =>
        Date.parse(value.retentionCutoff) > Date.parse(latest)
          ? value.retentionCutoff
          : latest,
      page.retentionCutoff,
    );
    const pages: NotificationSnapshot["pages"] = {};
    for (const [category, value] of Object.entries(current)) {
      pages[category as NotificationFilter] = {
        ...value,
        retentionCutoff: cutoff,
        items: value.items.filter(
          (item) => Date.parse(item.createdAt) >= Date.parse(cutoff),
        ),
      };
    }
    this.update({ pages });
  }
  activate(filter: NotificationFilter) {
    this.active = filter;
    void this.refresh(filter);
  }
  async refreshVisible() {
    await Promise.all([
      this.refresh("all"),
      ...(this.active === "all" ? [] : [this.refresh(this.active)]),
    ]);
  }
  async refresh(filter: NotificationFilter): Promise<void> {
    if (this.value.forbidden) return;
    if (this.requests.has(filter)) {
      this.pending.add(filter);
      return;
    }
    const controller = new AbortController();
    this.requests.set(filter, controller);
    this.update({
      loading: { ...this.value.loading, [filter]: true },
      errors: { ...this.value.errors, [filter]: undefined },
    });
    try {
      const page = await reconcileNotificationPages(
        this.value.pages[filter] ?? null,
        async (before) => this.read(filter, before, controller.signal),
      );
      if (!controller.signal.aborted) this.setPage(filter, page);
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof NotificationAccessError) this.clear(true);
        else
          this.update({
            errors: {
              ...this.value.errors,
              [filter]:
                error instanceof Error
                  ? error.message
                  : "Notifications could not be loaded.",
            },
          });
      }
    } finally {
      if (this.requests.get(filter) === controller) {
        this.requests.delete(filter);
        this.update({ loading: { ...this.value.loading, [filter]: false } });
      }
      if (this.pending.delete(filter)) void this.refresh(filter);
    }
  }
  async older(filter: NotificationFilter) {
    const page = this.value.pages[filter];
    if (!page?.nextCursor || this.requests.has(filter)) return;
    const controller = new AbortController();
    this.requests.set(filter, controller);
    this.update({ loading: { ...this.value.loading, [filter]: true } });
    try {
      const next = await this.read(filter, page.nextCursor, controller.signal);
      if (
        next.nextCursor &&
        JSON.stringify(next.nextCursor) === JSON.stringify(page.nextCursor)
      )
        throw Error("Notification pagination did not advance. Try again.");
      if (!controller.signal.aborted)
        this.setPage(filter, {
          ...next,
          items: [
            ...new Map(
              [...page.items, ...next.items].map((item) => [item.id, item]),
            ).values(),
          ],
        });
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof NotificationAccessError) this.clear(true);
        else
          this.update({
            errors: {
              ...this.value.errors,
              [filter]:
                error instanceof Error
                  ? error.message
                  : "Could not load older notifications.",
            },
          });
      }
    } finally {
      if (this.requests.get(filter) === controller) {
        this.requests.delete(filter);
        this.update({ loading: { ...this.value.loading, [filter]: false } });
      }
      if (this.pending.delete(filter)) void this.refresh(filter);
    }
  }
  clear(forbidden = false) {
    for (const request of this.requests.values()) request.abort();
    this.requests.clear();
    this.pending.clear();
    this.update({ pages: {}, loading: {}, errors: {}, forbidden });
  }
}
