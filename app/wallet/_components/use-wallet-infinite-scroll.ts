"use client";

import { useEffect, useRef, type RefObject } from "react";

interface WalletInfiniteScrollOptions {
  readonly enabled: boolean;
  readonly blocked: boolean;
  readonly continuationKey: string | null;
  readonly onLoadMore: () => void;
}

/** Observe one mobile continuation at a time; React Query owns requests and retries. */
export function useWalletInfiniteScroll({
  enabled,
  blocked,
  continuationKey,
  onLoadMore,
}: WalletInfiniteScrollOptions): RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!enabled || blocked || continuationKey === null || !sentinel || !("IntersectionObserver" in window)) return;

    const desktop = window.matchMedia("(min-width: 768px)");
    let observer: IntersectionObserver | undefined;
    let disposed = false;
    let requested = false;

    const observeMobile = () => {
      observer?.disconnect();
      observer = undefined;
      if (desktop.matches || requested || disposed) return;

      observer = new IntersectionObserver((entries) => {
        if (disposed || desktop.matches || requested || !entries.some((entry) => entry.isIntersecting)) return;
        requested = true;
        observer?.disconnect();
        onLoadMore();
      }, { rootMargin: "160px 0px" });
      observer.observe(sentinel);
    };

    observeMobile();
    desktop.addEventListener("change", observeMobile);
    return () => {
      disposed = true;
      observer?.disconnect();
      desktop.removeEventListener("change", observeMobile);
    };
  }, [enabled, blocked, continuationKey, onLoadMore]);

  return sentinelRef;
}
