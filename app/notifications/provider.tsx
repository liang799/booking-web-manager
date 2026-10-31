"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { NotificationFilter } from "@/use-cases/notifications/notification-inbox";
import { NotificationStore } from "./notification-store";
import { LocalNotificationReads } from "./local-reads";
import { fetchNotifications } from "./transport";
import { subscribeToNotifications } from "./realtime";
import { startNotificationUpdates } from "./updates";

interface Value {
  store: NotificationStore;
  reads: LocalNotificationReads;
  revision: number;
  changed: () => void;
}
const Context = createContext<Value | null>(null);
export function NotificationProvider({
  userId,
  children,
  readPage = fetchNotifications,
  subscribe,
}: {
  userId: string;
  children: React.ReactNode;
  readPage?: typeof fetchNotifications;
  subscribe?: (invalidate: () => void) => () => void;
}) {
  const store = useMemo(
    () => new NotificationStore(readPage),
    [userId, readPage],
  );
  const reads = useMemo(() => {
    let storage: Storage | undefined;
    try {
      if (typeof window !== "undefined") storage = window.localStorage;
    } catch {
      /* Browser storage is optional. */
    }
    return new LocalNotificationReads(userId, storage);
  }, [userId]);
  const [revision, setRevision] = useState(0);
  const changed = () => setRevision((x) => x + 1);
  useEffect(() => {
    const stop = startNotificationUpdates({
      refresh: () => store.refreshVisible(),
      subscribe: (invalidate) =>
        subscribe
          ? subscribe(invalidate)
          : subscribeToNotifications(userId, invalidate, () =>
              store.clear(true),
            ),
      document,
      window,
      online: () => navigator.onLine,
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key === reads.key || event.key === null) {
        reads.reload();
        changed();
      }
    };
    window.addEventListener("storage", onStorage);
    const unwatch = store.subscribe(() => {
      if (store.snapshot().forbidden) stop();
      const cutoff = store.snapshot().pages.all?.retentionCutoff;
      if (cutoff) reads.prune(cutoff);
    });
    return () => {
      stop();
      unwatch();
      store.clear();
      window.removeEventListener("storage", onStorage);
    };
  }, [store, reads, userId, subscribe]);
  return (
    <Context.Provider value={{ store, reads, revision, changed }}>
      {children}
    </Context.Provider>
  );
}
export function useNotificationContext() {
  return useContext(Context);
}
export function useNotificationPage(filter: NotificationFilter) {
  const context = useContext(Context);
  if (!context) throw Error("NotificationProvider is required");
  const snapshot = useSyncExternalStore(
    context.store.subscribe,
    context.store.snapshot,
    context.store.snapshot,
  );
  useEffect(() => {
    context.store.activate(filter);
  }, [context.store, filter]);
  return { ...context, snapshot, page: snapshot.pages[filter] };
}
export function useNewNotifications() {
  const context = useContext(Context);
  const empty = useMemo(() => new NotificationStore(), []);
  const store = context?.store ?? empty;
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.snapshot,
    store.snapshot,
  );
  return Boolean(context?.reads.hasNew(snapshot.pages.all?.items[0]));
}
