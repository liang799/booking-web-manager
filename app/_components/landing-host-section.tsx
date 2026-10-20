"use client";

import { Pause, Play } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import styles from "./landing-view.module.css";

/** Progressive decoration: the server-rendered copy, court and link work without JS. */
export function LandingHostSection({ children }: { children: ReactNode }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || !("IntersectionObserver" in window)) return;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let inView = false;
    const updateMotion = () => {
      const running = inView && !document.hidden && !preference.matches && !paused;
      section.dataset.motion = running ? "running" : "paused";
      if (running) section.dataset.revealed = "true";
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? false;
      updateMotion();
    }, { threshold: 0 });

    section.dataset.enhanced = "true";
    updateMotion();
    observer.observe(section);
    preference.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateMotion);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateMotion);
      section.dataset.motion = "paused";
    };
  }, [paused]);

  return (
    <section ref={sectionRef} className={styles.hostSection} id="host" aria-labelledby="host-title" tabIndex={-1}>
      <div className={styles.hostCopy}>{children}</div>
      <div className={styles.courtScene}>
        <div className={styles.courtStage}>
          <svg className={styles.courtMark} viewBox="0 0 600 414" fill="none" aria-hidden="true" data-testid="host-court">
            <g className={styles.courtLines}>
              <path className={styles.courtOutline} pathLength="1" d="M20 20H580V394H20Z" />
              <path className={styles.courtSidelines} pathLength="1" d="M20 57H580M20 357H580" />
              <path className={styles.courtService} pathLength="1" d="M155 57V357M445 57V357M155 207H445" />
              <path className={styles.courtNet} pathLength="1" d="M300 20V394" />
            </g>
            <g className={styles.courtRipples}>
              <g transform="translate(170 150)"><circle className={styles.rippleOne} r="12" /></g>
              <g transform="translate(455 275)"><circle className={styles.rippleTwo} r="12" /></g>
              <g transform="translate(145 300)"><circle className={styles.rippleThree} r="12" /></g>
              <g transform="translate(430 120)"><circle className={styles.rippleFour} r="12" /></g>
            </g>
            <g className={styles.ballShadow}><ellipse rx="12" ry="7" /></g>
            <g className={`${styles.ballTrail} ${styles.ballTrailFar}`}><circle r="5" /></g>
            <g className={styles.ballTrail}><circle r="7" /></g>
            <g className={styles.courtBall} data-testid="court-ball">
              <circle r="10" />
              <path d="M-7-7C2-4 2 4-7 7M7-7C-2-4-2 4 7 7" />
            </g>
          </svg>
        </div>
        <button
          type="button"
          className={styles.motionToggle}
          onClick={() => setPaused(!paused)}
          aria-label={paused ? "Play court animation" : "Pause court animation"}
          aria-pressed={paused}
        >
          {paused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
          <span>{paused ? "Play motion" : "Pause motion"}</span>
        </button>
      </div>
    </section>
  );
}
