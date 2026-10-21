"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

type EntrancePhase = "pending" | "line" | "dot" | "card" | "complete";

/** A presentation-only entrance; the overview owns its lifetime, never the URL store. */
export function useTimelineEntrance({ root, played, marker, restoring, activeSessionId }: {
  readonly root: RefObject<HTMLDivElement | null>;
  readonly played: RefObject<boolean>;
  readonly marker: number;
  readonly restoring: boolean;
  readonly activeSessionId: string;
}) {
  const [phase, setPhase] = useState<EntrancePhase>("pending");
  const cancel = useRef<(() => void) | null>(null);
  const finish = useCallback(() => {
    played.current = true;
    const stop = cancel.current;
    cancel.current = null;
    stop?.();
    setPhase("complete");
  }, [played]);

  useLayoutEffect(() => {
    const timeline = root.current;
    if (!timeline) return;
    const desktop = window.matchMedia("(min-width: 768px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (played.current || !desktop.matches || reducedMotion.matches) {
      finish();
      return;
    }
    // URL restoration measures and scrolls to the real selection before the intro.
    if (marker <= 0 || restoring) return;
    const rail = timeline.querySelector<HTMLElement>("[data-timeline-rail]");
    const dot = timeline.querySelector<HTMLElement>("[data-timeline-marker]");
    const card = timeline.querySelector<HTMLElement>("[data-current] [data-timeline-expanded]");
    if (!rail || !dot || !card || typeof rail.animate !== "function") {
      finish();
      return;
    }

    const animations: Animation[] = [];
    const events = new AbortController();
    let stopped = false;
    const stop = () => {
      stopped = true;
      events.abort();
      animations.forEach((animation) => animation.cancel());
    };
    cancel.current = stop;
    const animate = async (element: HTMLElement, frames: Keyframe[], duration: number) => {
      const animation = element.animate(frames, { duration, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" });
      animations.push(animation);
      await animation.finished;
    };
    // Wait until layout/provider effects settle. StrictMode's discarded setup
    // cancels this frame before it can consume the overview's one-time entrance.
    const frame = requestAnimationFrame(async () => {
      if (stopped) return;
      played.current = true;
      if (document.hidden) { finish(); return; }
      // Deep links begin at the visible portion of the rail, never scroll back up.
      const origin = Math.max(8, Math.min(marker, 16 - timeline.getBoundingClientRect().top));
      try {
        setPhase("line");
        await animate(rail, [{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], 600);
        if (stopped) return;
        setPhase("dot");
        await animate(dot, [
          { opacity: 0, transform: `translateY(${origin - 7}px) scale(.7)` },
          { opacity: 1, offset: .25 },
          { opacity: 1, transform: `translateY(${marker - 7}px) scale(1)` },
        ], 420);
        if (stopped) return;
        setPhase("card");
        await animate(card, [
          { opacity: 0, clipPath: "inset(0 0 100% 0)", transform: "translateY(8px)" },
          { opacity: 1, offset: .35 },
          { opacity: 1, clipPath: "inset(0 0 0% 0)", transform: "translateY(0)" },
        ], 520);
        if (!stopped) finish();
      } catch {
        // Cancellation restores the fully rendered state; no delayed phase may win.
        if (!stopped) finish();
      }
    });
    const interrupt = () => finish();
    window.addEventListener("wheel", interrupt, { passive: true, signal: events.signal });
    window.addEventListener("touchstart", interrupt, { passive: true, signal: events.signal });
    window.addEventListener("keydown", interrupt, { signal: events.signal });
    window.addEventListener("resize", interrupt, { signal: events.signal });
    document.addEventListener("visibilitychange", interrupt, { signal: events.signal });
    reducedMotion.addEventListener("change", interrupt, { signal: events.signal });
    desktop.addEventListener("change", interrupt, { signal: events.signal });
    return () => {
      cancelAnimationFrame(frame);
      stop();
      if (cancel.current === stop) cancel.current = null;
    };
  }, [root, played, marker, restoring, activeSessionId, finish]);

  return { phase, finish };
}
