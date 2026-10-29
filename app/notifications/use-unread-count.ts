"use client";

import { useEffect, useState } from "react";

/** Shell badge refreshes on navigation, window focus and successful read mutations. */
export function useUnreadNotificationCount(pathname: string) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let controller: AbortController | undefined;
    const refresh = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      fetch("/api/notifications?filter=unread", { cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]) })
        .then(async (response) => {
          if (!response.ok) throw new Error("Inbox unavailable");
          const result: unknown = await response.json();
          if (!request.signal.aborted && result && typeof result === "object" && "unreadCount" in result && typeof result.unreadCount === "number") setCount(result.unreadCount);
        }).catch(() => { if (!request.signal.aborted) setCount(null); });
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("notifications:changed", refresh);
    return () => {
      controller?.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("notifications:changed", refresh);
    };
  }, [pathname]);
  return count;
}
