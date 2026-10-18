"use client";

import { ArrowRight, ArrowUpRight, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import styles from "./landing-view.module.css";

/** Enhance same-page links while preserving their native URLs and no-JavaScript behavior. */
export function LandingPage({ children }: { children: ReactNode }) {
  function navigateToSection(event: MouseEvent<HTMLElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest("a") : null;
    const href = link?.getAttribute("href");
    if (!href?.startsWith("#") || link?.hasAttribute("download") || (link?.target && link.target !== "_self")) return;
    // Keep the keyboard shortcut immediate, even when decorative motion is enabled.
    if (href === "#landing-content") return;
    const section = document.getElementById(href.slice(1));
    if (!section) return;

    event.preventDefault();
    if (window.location.hash !== href) window.history.pushState(window.history.state, "", href);
    section.focus({ preventScroll: true });
    section.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      block: "start",
    });
  }

  return <main className={styles.page} onClick={navigateToSection}>{children}</main>;
}

type MenuState = "closed" | "open" | "closing";

function focusDesktopNavigation() {
  document.querySelector<HTMLAnchorElement>('nav[aria-label="Main navigation"] a')?.focus({ preventScroll: true });
}

export function LandingMobileMenu() {
  const [state, setState] = useState<MenuState>("closed");
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const pointerInside = useRef(false);
  const expanded = state === "open";

  function close() {
    setState((current) => current === "open" ? "closing" : current);
  }

  useEffect(() => {
    if (state !== "closing") return;
    // Reduced motion has no animationend. Also recover if an animation is interrupted.
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200;
    const timer = window.setTimeout(() => setState("closed"), delay);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (!expanded) return;
    function finishPointerInteraction() {
      pointerInside.current = false;
    }
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !detailsRef.current?.contains(event.target)) {
        // Don't leave focus inside a disclosure that is becoming inert.
        if (detailsRef.current?.contains(document.activeElement)) triggerRef.current?.focus({ preventScroll: true });
        setState("closing");
      }
    }
    function dismissWithEscape(event: KeyboardEvent) {
      finishPointerInteraction();
      if (event.key !== "Escape") return;
      event.preventDefault();
      triggerRef.current?.focus({ preventScroll: true });
      setState("closing");
    }
    document.addEventListener("pointerdown", dismissOutside);
    // Touch compatibility mouse events can move focus after pointerup, before click.
    document.addEventListener("click", finishPointerInteraction);
    document.addEventListener("pointercancel", finishPointerInteraction);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      finishPointerInteraction();
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("click", finishPointerInteraction);
      document.removeEventListener("pointercancel", finishPointerInteraction);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [expanded]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 701px)");
    function dismissOnDesktop() {
      if (!desktop.matches) return;
      if (detailsRef.current?.contains(document.activeElement)) {
        focusDesktopNavigation();
      }
      setState("closed");
    }
    desktop.addEventListener("change", dismissOnDesktop);
    return () => desktop.removeEventListener("change", dismissOnDesktop);
  }, []);

  return (
    <details
      ref={detailsRef}
      className={styles.mobileMenu}
      open={state !== "closed"}
      data-state={state}
      onPointerDownCapture={() => { pointerInside.current = expanded; }}
      onBlur={(event) => {
        // CSS can hide the focused item before the breakpoint listener runs.
        if (event.relatedTarget === null && window.matchMedia("(min-width: 701px)").matches) {
          focusDesktopNavigation();
        }
        // Safari may focus the containing section instead of the tapped link.
        // Let that pointer interaction finish; keyboard focus leaving still dismisses.
        if (!pointerInside.current && !event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <summary
        ref={triggerRef}
        aria-label={expanded ? "Close navigation menu" : "Open navigation menu"}
        aria-controls="landing-mobile-navigation"
        onClick={(event) => {
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          setState((current) => current === "open" ? "closing" : "open");
        }}
      >
        <span className={styles.menuIcon} aria-hidden="true"><span /><span /><span /></span>
      </summary>
      <nav
        id="landing-mobile-navigation"
        className={styles.menuPanel}
        aria-label="Mobile navigation"
        inert={state === "closing" ? true : undefined}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && state === "closing") setState("closed");
        }}
        onClick={(event) => {
          if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          const link = event.target instanceof Element ? event.target.closest("a") : null;
          if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
          triggerRef.current?.focus({ preventScroll: true });
          close();
        }}
      >
        <p className={styles.menuEyebrow}>Make time for play</p>
        <div className={styles.menuLinks}>
          <Link href="/discover"><span>Discover sessions</span><ArrowUpRight aria-hidden="true" /></Link>
          <a href="#sports"><span>Find your sport</span><ArrowRight aria-hidden="true" /></a>
          <a href="#how-it-works"><span>How it works</span><ArrowRight aria-hidden="true" /></a>
          <Link href="/sessions/create" prefetch={false}><span>Host a session</span><ArrowUpRight aria-hidden="true" /></Link>
        </div>
        <div className={styles.menuUtilities}>
          <Link href="/login" prefetch={false}><UserRound aria-hidden="true" /><span>Sign in</span><ArrowRight aria-hidden="true" /></Link>
          <Link href="/profile" prefetch={false}><Settings aria-hidden="true" /><span>Settings</span><ArrowRight aria-hidden="true" /></Link>
        </div>
        <div className={styles.menuFooter}>
          <p>Same sport<br />Different people —</p>
          <svg className={styles.menuCourt} viewBox="0 0 240 200" aria-hidden="true" focusable="false">
            <path d="M 0 200 A 240 200 0 0 1 240 0" />
            <path d="M 150 200 A 90 75 0 0 1 240 125" />
          </svg>
        </div>
      </nav>
    </details>
  );
}
