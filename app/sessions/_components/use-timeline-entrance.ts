"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

type EntrancePhase = "pending" | "line" | "dot" | "details" | "complete";

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
    let initialScroll: number | null = null;
    const stop = () => {
      stopped = true;
      events.abort();
      animations.forEach((animation) => animation.cancel());
    };
    cancel.current = stop;
    const animate = async (element: HTMLElement, frames: Keyframe[], duration: number, delay = 0, easing = "cubic-bezier(.22,1,.36,1)") => {
      const animation = element.animate(frames, { duration, delay, easing, fill: "both" });
      animations.push(animation);
      await animation.finished;
    };
    const start = async () => {
      if (stopped) return;
      played.current = true;
      if (document.hidden) { finish(); return; }
      // Draw the visible segment at a consistent pace, even on a long/deep-linked
      // feed. The full rail becomes available when the entrance completes.
      const railBounds = rail.getBoundingClientRect();
      const visibleStart = Math.min(railBounds.height, Math.max(0, -railBounds.top));
      const visibleEnd = Math.min(railBounds.height, Math.max(visibleStart, window.innerHeight - railBounds.top));
      const origin = Math.min(marker, railBounds.top - timeline.getBoundingClientRect().top + visibleStart + 7);
      // Only movement after restoration's queued anchoring frame and the
      // entrance's geometry measurements counts as an interruption.
      initialScroll = window.scrollY;
      try {
        setPhase("line");
        await animate(rail, [
          { clipPath: `inset(${visibleStart}px 0 ${railBounds.height - visibleStart}px 0)` },
          { clipPath: `inset(${visibleStart}px 0 ${railBounds.height - visibleEnd}px 0)` },
        ], 560, 0, "cubic-bezier(.4,0,.2,1)");
        if (stopped) return;
        setPhase("dot");
        await animate(dot, [
          { opacity: 0, transform: `translateY(${origin - 7}px) scale(.65)` },
          { opacity: 1, offset: .2 },
          { opacity: 1, transform: `translateY(${marker - 7}px) scale(1.08)`, offset: .85 },
          { opacity: 1, transform: `translateY(${marker - 7}px) scale(1)` },
        ], 380);
        if (stopped) return;
        setPhase("details");
        const current = card.closest("[data-current]");
        const visible = Array.from(timeline.querySelectorAll<HTMLElement>("[data-timeline-reveal]")).filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.bottom > 0 && bounds.top < window.innerHeight + 64;
        });
        // Reveal the selected card first; offscreen history must not delay a
        // restored selection. Register all animations before awaiting cancellation.
        const primary = visible.filter((element) => current?.contains(element) || element.dataset.timelineReveal === "label");
        const secondary = visible.filter((element) => !primary.includes(element));
        await Promise.all([...primary, ...secondary].map((element, index) => {
          const kind = element.dataset.timelineReveal;
          const frames: Keyframe[] = kind === "date"
            ? [{ opacity: 0 }, { opacity: 1 }]
            : kind === "hero"
              ? [{ opacity: 0, clipPath: "inset(0 0 100% 0 round 6px)", transform: "translateY(8px)" }, { opacity: 1, clipPath: "inset(0 0 0% 0 round 6px)", transform: "translateY(0)" }]
              : [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }];
          // Dates never move: the marker measures the numeral's actual center.
          return animate(element, frames, 420, Math.min(index, 12) * 70);
        }));
        if (!stopped) finish();
      } catch {
        // Cancellation restores the fully rendered state; no delayed phase may win.
        if (!stopped) finish();
      }
    };
    // Browser scroll anchoring can follow restoration in the next frame. Let
    // that settle before claiming the entrance; StrictMode can cancel either
    // frame without consuming the overview's one-time animation.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(start);
    });
    const interrupt = () => finish();
    const interruptScroll = () => { if (initialScroll !== null && window.scrollY !== initialScroll) finish(); };
    window.addEventListener("wheel", interrupt, { passive: true, signal: events.signal });
    window.addEventListener("scroll", interruptScroll, { passive: true, signal: events.signal });
    window.addEventListener("pointerdown", interrupt, { signal: events.signal });
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
