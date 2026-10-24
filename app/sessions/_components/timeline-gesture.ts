export type TimelineGestureDirection = -1 | 1;
export type TimelineGesturePhase = "ready" | "accumulating" | "transitioning" | "momentum-consuming";

export interface TimelineGestureInput {
  /** Qualifying vertical wheel distance, normalized to pixels by the caller. */
  readonly delta: number;
  /** Monotonic event time in milliseconds. */
  readonly now: number;
  readonly momentum: boolean;
  readonly transitioning: boolean;
  /** Whether the input's direction has an adjacent session. */
  readonly hasNeighbor: boolean;
}

export type TimelineGestureDecision =
  | { readonly kind: "pass" | "consume" }
  | { readonly kind: "navigate" | "queue"; readonly direction: TimelineGestureDirection };

const intentThreshold = 24;
const quietInterval = 220;

/** Own one wheel burst independently of how long its visual transition takes. */
export class TimelineGesture {
  private currentPhase: TimelineGesturePhase = "ready";
  private lastEventAt: number | null = null;
  private ownership: "none" | "timeline" | "page" = "none";
  private direction: TimelineGestureDirection | null = null;
  private distance = 0;
  private committed = false;

  get phase(): TimelineGesturePhase { return this.currentPhase; }

  handle({ delta, now, momentum, transitioning, hasNeighbor }: TimelineGestureInput): TimelineGestureDecision {
    if (!Number.isFinite(delta) || !Number.isFinite(now) || delta === 0) return { kind: "pass" };

    // A positive browser momentum signal remains a tail even after a delayed
    // event. It can neither create navigation nor transfer page-owned input.
    if (momentum) {
      this.lastEventAt = now;
      if (this.ownership !== "timeline") {
        this.ownership = "page";
        this.currentPhase = "ready";
        return { kind: "pass" };
      }
      this.committed = true;
      this.currentPhase = transitioning ? "transitioning" : "momentum-consuming";
      return { kind: "consume" };
    }

    // Browsers without a momentum signal use this quiet interval as a burst
    // heuristic. Completing an animation never starts another burst by itself.
    if (this.lastEventAt === null || now - this.lastEventAt >= quietInterval) this.reset();
    this.lastEventAt = now;
    if (this.ownership === "page") return { kind: "pass" };
    if (this.committed) {
      this.currentPhase = transitioning ? "transitioning" : "momentum-consuming";
      return { kind: "consume" };
    }

    if (!hasNeighbor) {
      this.ownership = "page";
      this.currentPhase = "ready";
      return { kind: "pass" };
    }

    const direction = delta < 0 ? -1 : 1;
    this.distance = this.direction === direction ? this.distance + Math.abs(delta) : Math.abs(delta);
    this.direction = direction;
    this.ownership = "timeline";
    this.currentPhase = "accumulating";
    if (this.distance < intentThreshold) return { kind: "consume" };

    this.committed = true;
    this.currentPhase = "transitioning";
    return { kind: transitioning ? "queue" : "navigate", direction };
  }

  transitionCompleted(): void {
    if (this.currentPhase === "transitioning") this.currentPhase = "momentum-consuming";
  }

  /** Release input ownership after a dialog, direct navigation or native takeover. */
  reset(): void {
    this.currentPhase = "ready";
    this.lastEventAt = null;
    this.ownership = "none";
    this.direction = null;
    this.distance = 0;
    this.committed = false;
  }
}
