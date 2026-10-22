"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { NavigationIcon } from "./navigation-icon";
import { cn } from "@/lib/utils";
import styles from "./mobile-navigation.module.css";

const destinations = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/sessions", label: "Sessions", icon: "sessions" },
  { href: "/wallet", label: "Wallet", icon: "wallet" },
  { href: "/profile", label: "Settings", icon: "settings" },
] as const;

function selectedIndex(pathname: string) {
  return destinations.findIndex(({ href }) =>
    pathname === href || pathname.startsWith(`${href}/`)
    || (href === "/sessions" && (pathname === "/groups" || pathname.startsWith("/groups/"))),
  );
}

interface SelectionSnapshot {
  readonly index: number;
  readonly width: number;
  readonly pill: Keyframe;
  readonly links: readonly { readonly item: Keyframe; readonly label: Keyframe; readonly divider: Keyframe }[];
}

function navigationElements(track: HTMLDivElement) {
  return {
    pill: track.querySelector<HTMLElement>(`.${styles.pill}`)!,
    links: Array.from(track.querySelectorAll("a")).map((item) => ({
      item,
      label: item.querySelector<HTMLElement>(`.${styles.label}`)!,
      divider: item.querySelector<HTMLElement>(`.${styles.divider}`)!,
    })),
  };
}

/** Read the rendered frame, including any interrupted Web Animations. */
function snapshot(track: HTMLDivElement, index: number): SelectionSnapshot {
  const elements = navigationElements(track);
  return {
    index,
    width: track.getBoundingClientRect().width,
    pill: { left: getComputedStyle(elements.pill).left },
    links: elements.links.map(({ item, label, divider }) => {
      const text = getComputedStyle(label);
      return {
        item: { flexGrow: getComputedStyle(item).flexGrow },
        label: { width: text.width, marginLeft: text.marginLeft, opacity: text.opacity, transform: text.transform },
        divider: { opacity: getComputedStyle(divider).opacity },
      };
    }),
  };
}

const PreviousSelection = createContext<RefObject<SelectionSnapshot | null> | null>(null);

/** Keeps only decorative selection continuity while each signed-in area mounts its own shell. */
export function MobileNavigationProvider({ children }: { readonly children: ReactNode }) {
  const previous = useRef<SelectionSnapshot | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (selectedIndex(pathname) === -1) previous.current = null;
  }, [pathname]);

  return <PreviousSelection.Provider value={previous}>{children}</PreviousSelection.Provider>;
}

/** Real route links with one travelling selection pill; routing never waits for the animation. */
export function MobileNavigation({ pathname, enabled = true, compact = false }: { readonly pathname: string; readonly enabled?: boolean; readonly compact?: boolean }) {
  const activeIndex = selectedIndex(pathname);
  const previous = useContext(PreviousSelection);
  const localPrevious = useRef<SelectionSnapshot | null>(null);
  const selection = previous ?? localPrevious;
  const trackRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const track = trackRef.current!;
    const origin = selection.current;
    const viewport = window.matchMedia("(max-width: 767px)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const target = snapshot(track, activeIndex);
    const animations: Animation[] = [];
    const visible = () => enabled && viewport.matches && activeIndex >= 0;
    const finish = () => {
      animations.forEach((animation) => animation.cancel());
      selection.current = visible() ? snapshot(track, activeIndex) : null;
    };

    if (visible() && origin && origin.index >= 0 && Math.abs(origin.width - target.width) < 1 && !motion.matches) {
      const elements = navigationElements(track);
      const animate = (element: HTMLElement, from: Keyframe, to: Keyframe) => {
        if (Object.keys(to).every((key) => from[key] === to[key])) return;
        animations.push(element.animate([from, to], {
          duration: 380,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        }));
      };
      animate(elements.pill, origin.pill, target.pill);
      elements.links.forEach(({ item, label, divider }, index) => {
        const from = origin.links[index]!;
        const to = target.links[index]!;
        animate(item, from.item, to.item);
        animate(label, from.label, to.label);
        animate(divider, from.divider, to.divider);
      });
    }

    // A resize invalidates pixel geometry; the responsive CSS remains authoritative.
    const resize = new ResizeObserver(() => {
      if (Math.abs(track.getBoundingClientRect().width - target.width) >= 1) finish();
    });
    resize.observe(track);
    motion.addEventListener("change", finish);
    viewport.addEventListener("change", finish);
    return () => {
      // Capture before cancelling or removing the old shell so quick taps start at this frame.
      selection.current = visible() ? snapshot(track, activeIndex) : null;
      animations.forEach((animation) => animation.cancel());
      resize.disconnect();
      motion.removeEventListener("change", finish);
      viewport.removeEventListener("change", finish);
    };
  }, [activeIndex, enabled, selection]);

  return (
    <nav className={cn(styles.navigation, compact && styles.compact)} aria-label="Main">
      <div
        ref={trackRef}
        className={styles.track}
        style={{ "--active-index": Math.max(activeIndex, 0) } as CSSProperties}
        data-has-selection={activeIndex >= 0}
      >
        <span className={styles.pill} aria-hidden="true" />
        {destinations.map(({ href, label, icon }, index) => (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={index === activeIndex ? "page" : undefined}
            title={index === activeIndex ? undefined : label}
            className={styles.link}
            data-selected={index === activeIndex}
          >
            <span className={styles.content}>
              <NavigationIcon name={icon} active={index === activeIndex} />
              <span className={styles.label} aria-hidden="true"><span>{label}</span></span>
            </span>
            <span className={styles.divider} aria-hidden="true" data-visible={index < destinations.length - 1 && index !== activeIndex && index + 1 !== activeIndex} />
          </Link>
        ))}
      </div>
    </nav>
  );
}
