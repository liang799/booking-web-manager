"use client";

import { ArrowRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3, ExternalLink, MapPin, Plus, UsersRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SessionFeedItem } from "../session-feed-contract";
import type { SessionAccountAction } from "../session-actions";
import { sessionArtwork, sessionCalendarHref, sessionDate, sessionStatus, sessionTime, sessionTitle, timelineGroup } from "./session-display";
import { useSessionsUiStore } from "./sessions-ui-provider";
import type { SessionDetailsPanel } from "./sessions-ui-store";
import styles from "./sessions.module.css";
import { useTimelineEntrance } from "./use-timeline-entrance";
import { SessionsSkeleton } from "./sessions-skeleton";

export interface SessionsViewProps {
  readonly tab: "joined" | "hosting";
  readonly onTabChange: (tab: "joined" | "hosting") => void;
  readonly sessions: readonly SessionFeedItem[];
  readonly asOf: string;
  readonly upcomingCount: number;
  readonly pastCount: number;
  readonly actions: readonly SessionAccountAction[];
  readonly loading?: boolean;
  readonly error?: string;
  readonly loadingMore?: boolean;
  readonly hasMore?: boolean;
  readonly onLoadMore: () => void;
  readonly onRetry: () => void;
  readonly onOpenSession: (session: SessionFeedItem) => void;
  readonly scrollTargetId?: string | null;
  readonly onUrlRestored?: () => void;
}

/** A shared feed, with a scroll-driven desktop timeline and a simple mobile list. */
export function SessionsView(props: SessionsViewProps) {
  const { tab, onTabChange, sessions, actions, loading, error, onRetry } = props;
  const timelineEntrancePlayed = useRef(false);
  const historyPages = tab === "joined" && sessions.filter((session) => session.section === "upcoming").length >= props.upcomingCount;
  const creation = actions.find((action) => action.name === "create-session");
  const email = actions.find((action) => action.name === "add-email");
  return <div className={styles.page} data-view={tab} data-empty={!loading && !error && sessions.length === 0 || undefined}>
    <h1 id="sessions-heading" tabIndex={-1} className="sr-only">Sessions</h1>
    <div className={styles.breadcrumb} aria-hidden>My sessions <span>/</span></div>
    <div className={styles.panel}>
    <header className={styles.header}>
      <nav className={styles.tabs} aria-label="Session views">
        <button type="button" aria-current={tab === "joined" ? "page" : undefined} onClick={() => onTabChange("joined")}>Joined</button>
        <button type="button" aria-current={tab === "hosting" ? "page" : undefined} onClick={() => onTabChange("hosting")}>Hosting</button>
        <Link href="/groups" className={styles.mobileGroups}>Groups</Link>
      </nav>
      {creation && <Link href={creation.href} className={styles.primaryButton} aria-label="New session"><Plus size={20} strokeWidth={1.4} aria-hidden /><span>New session</span></Link>}
    </header>
    {email && <p className={styles.notice}>Add an email address to host a session. <Link href={email.href}>Add email</Link></p>}
    {loading ? <SessionsSkeleton tab={tab} />
      : error && sessions.length === 0 ? <div className={styles.empty}><p role="alert">{error}</p><button className={styles.secondaryButton} onClick={onRetry}>Try again</button></div>
      : sessions.length === 0 ? <EmptySessions tab={tab} actions={actions} />
      : <>
        <div className={styles.desktop}>
          {historyPages && (props.hasMore || error) && <FeedPagination {...props} edge="start" />}
          {tab === "joined" ? <JoinedTimeline key={tab} {...props} entrancePlayed={timelineEntrancePlayed} /> : <HostingSessions {...props} />}
        </div>
        <ul className={styles.mobileList} aria-label={`${tab === "joined" ? "Joined" : "Hosting"} sessions`}>
          {sessions.map((session) => <li key={session.sessionId}><button type="button" className={styles.mobileCard} onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); props.onOpenSession(session); }} aria-label={`View ${sessionTitle(session)} at ${session.venueName}, ${sessionDate(session.startAt).full}`}>
            <DateStamp value={session.startAt} />
            <span className={styles.mobileCopy}><strong>{sessionTitle(session)}</strong><span>{session.venueName}</span><span>{sessionTime(session)}</span>{sessionStatus(session) !== "Joined" && sessionStatus(session) !== "Hosting" && <span className={styles.mobileStatus}>{sessionStatus(session)}</span>}</span>
          </button></li>)}
        </ul>
        <div className={historyPages ? styles.mobilePagination : undefined}><FeedPagination {...props} /></div>
      </>}
    </div>
  </div>;
}

function EmptySessions({ tab, actions }: Pick<SessionsViewProps, "tab" | "actions">) {
  const id = useId();
  const joined = tab === "joined";
  const creation = actions.find((action) => action.name === "create-session");
  const email = actions.find((action) => action.name === "add-email");
  const createHref = creation?.href ?? email?.href ?? "/profile";
  const createLabel = creation ? "Create a session" : email ? "Add email" : "Set up your account";
  const discoverHref = "/discover?returnTo=%2Fsessions";
  const starters = joined ? [
    { title: "Join a public session", description: "Browse and join sessions in your area.", href: discoverHref, crop: "ball" },
    { title: "Create your own", description: "Book a court and invite friends.", href: createHref, crop: "net" },
    { title: "Play with a group", description: "Create or join a group for regular sessions.", href: "/groups", crop: "racket" },
  ] : [
    { title: "Choose a court", description: "Pick a location, date and time that works for you.", href: createHref, crop: "ball" },
    { title: "Set session details", description: "Add player limit, description and any notes.", href: createHref, crop: "net" },
    { title: "Invite others", description: "Share the session with friends or groups.", href: "/groups", crop: "racket" },
  ];
  return <section className={styles.emptySessions} aria-labelledby={`${id}-heading`}>
    <div className={styles.emptyHero} data-artwork={joined ? "court" : "bench"}>
      <Image src={`/images/sessions/${joined ? "court" : "bench"}.webp`} alt="" fill priority sizes="(min-width: 768px) 80vw, 100vw" className={styles.photo} />
    </div>
    <div className={styles.emptyCopy}>
      <p className={styles.emptyEyebrow}>{joined ? "No sessions yet" : "No hosted sessions yet"}</p>
      <h2 id={`${id}-heading`}>{joined ? "Your sessions will appear here." : "You haven’t created any sessions."}</h2>
      <p className={styles.emptyDescription}>{joined ? "Join a session or create your own to start playing with others." : "Create a session to book a court, set the details, and invite others to join."}</p>
      <div className={styles.emptyActions}>
        <Link className={styles.primaryButton} href={joined ? discoverHref : createHref}><Plus size={22} strokeWidth={1.3} aria-hidden />{joined ? "Join a session" : createLabel}</Link>
        <Link className={styles.emptySecondaryButton} href={joined ? createHref : discoverHref}>{joined ? createLabel : "Join a session"}<ArrowRight size={20} strokeWidth={1.5} aria-hidden /></Link>
      </div>
    </div>
    <section className={styles.emptySuggestions} aria-labelledby={`${id}-suggestions`}>
      <h2 id={`${id}-suggestions`}>{joined ? "Ideas to get started" : "Tips to get started"}</h2>
      <ul className={styles.emptyStarterCards}>
        {starters.map((starter) => <li key={starter.title}>
          <Link href={starter.href} className={styles.emptyStarterCard}>
            <span className={styles.emptyThumb} data-crop={starter.crop}><Image src={`/images/sessions/${starter.crop === "racket" ? "bench" : "court"}.webp`} alt="" fill sizes={starter.crop === "ball" ? "820px" : starter.crop === "racket" ? "370px" : "160px"} className={styles.photo} /></span>
            <div className={styles.emptyStarterCopy}><h3>{starter.title}</h3><span>{starter.description}</span></div>
            <ChevronRight size={18} strokeWidth={1.4} aria-hidden />
          </Link>
        </li>)}
      </ul>
    </section>
  </section>;
}

function DateStamp({ value }: { readonly value: string }) {
  const date = sessionDate(value);
  return <time dateTime={value} aria-label={date.full} className={styles.date}><span>{date.weekday}</span><strong>{date.day}</strong><span>{date.month}</span></time>;
}

function Status({ session }: { readonly session: SessionFeedItem }) {
  return <span className={styles.status} data-tone={session.section === "upcoming" && session.status !== "CANCELLED" ? "green" : "neutral"}>{sessionStatus(session)}</span>;
}

function Players({ count, large = false }: { readonly count: number; readonly large?: boolean }) {
  // The feed exposes aggregate attendance only. Do not invent portraits or disclose a private roster.
  return <span className={styles.players} data-large={large || undefined} role="img" aria-label={`${count} participants`}>
    {Array.from({ length: Math.min(count, 3) }, (_, index) => <span key={index} aria-hidden><UsersRound size={large ? 21 : 15} strokeWidth={1.3} /></span>)}
    {count > 3 && <span className={styles.morePlayers}>+{count - 3}</span>}
    {count === 0 && <span aria-hidden><UsersRound size={large ? 21 : 15} strokeWidth={1.3} /></span>}
  </span>;
}

function Metadata({ session, reveal = true }: { readonly session: SessionFeedItem; readonly reveal?: boolean }) {
  return <span className={styles.metadata}>
    <span data-timeline-reveal={reveal ? "detail" : undefined}><Clock3 aria-hidden /><span className="sr-only">Singapore time: </span>{sessionTime(session)}</span>
    <span data-timeline-reveal={reveal ? "detail" : undefined}><UsersRound aria-hidden /><span>{session.participantCount} / {session.capacity}<span> players</span></span></span>
  </span>;
}

export function SessionDetails({ session, footer = true, onOpenSession }: { readonly session: SessionFeedItem; readonly footer?: boolean; readonly onOpenSession?: (session: SessionFeedItem) => void }) {
  const panel = useSessionsUiStore((state) => state.detailPanels[session.sessionId] ?? "details");
  const selectPanel = useSessionsUiStore((state) => state.selectDetailPanel);
  const setPanel = (next: SessionDetailsPanel) => selectPanel(session.sessionId, next);
  const id = useId();
  const tabs = useRef<HTMLDivElement>(null);
  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextPanel = event.key === "Home" ? "details" : event.key === "End" ? "participants" : panel === "details" ? "participants" : "details";
    setPanel(nextPanel);
    tabs.current?.querySelector<HTMLButtonElement>(`[data-panel="${nextPanel}"]`)?.focus();
  };
  return <>
    <div ref={tabs} className={styles.detailTabs} role="tablist" aria-label="Session information" onKeyDown={handleTabKeyDown}>
      <button type="button" role="tab" data-panel="details" tabIndex={panel === "details" ? 0 : -1} aria-selected={panel === "details"} onClick={() => setPanel("details")} id={`${id}-details-tab`} aria-controls={`${id}-panel`}>Details</button>
      <button type="button" role="tab" data-panel="participants" tabIndex={panel === "participants" ? 0 : -1} aria-selected={panel === "participants"} onClick={() => setPanel("participants")} id={`${id}-participants-tab`} aria-controls={`${id}-panel`}>Participants ({session.participantCount})</button>
    </div>
    <div role="tabpanel" tabIndex={0} id={`${id}-panel`} aria-labelledby={`${id}-${panel}-tab`} className={styles.detailPanel}>
      {panel === "details" ? <dl className={styles.details}>
        <div><dt><CalendarDays aria-hidden />Sport</dt><dd>{session.sport}</dd></div>
        <div><dt><MapPin aria-hidden />Location</dt><dd><a href={`https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: `${session.venueName}, Singapore` })}`} target="_blank" rel="noreferrer">{session.venueName}<ExternalLink size={14} aria-hidden /><span className="sr-only"> (opens in a new tab)</span></a></dd></div>
        <div><dt><Clock3 aria-hidden />Date &amp; time</dt><dd>{sessionDate(session.startAt).weekday}, {sessionDate(session.startAt).full}<br />{sessionTime(session)}<span className={styles.timezone}> SGT</span></dd></div>
        <div><dt><UsersRound aria-hidden />Availability</dt><dd>{session.participantCount} of {session.capacity} places filled</dd></div>
      </dl> : <div className={styles.participantPanel}><Players count={session.participantCount} large /><p>{session.participantCount} {session.participantCount === 1 ? "player has" : "players have"} a place in this session.</p><p className={styles.muted}>{session.role === "HOST" ? "Open the session to manage your participant list." : session.participationStatus === "WAITLISTED" ? "You’re on the waitlist. We’ll notify you when a place opens." : session.participationStatus === "COMMITTED" ? "You have a place. See you on court." : `Your status: ${sessionStatus(session).toLowerCase()}.`}</p></div>}
    </div>
    <footer className={styles.cardFooter}>
      <a className={styles.secondaryButton} href={sessionCalendarHref(session)} target="_blank" rel="noreferrer"><CalendarDays size={18} aria-hidden />View in calendar<ExternalLink size={14} aria-hidden /><span className="sr-only"> (opens in a new tab)</span></a>
      {footer && onOpenSession && <button type="button" className={styles.primaryButton} onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); onOpenSession(session); }}>View session<ArrowRight size={17} aria-hidden /></button>}
    </footer>
  </>;
}

function ExpandedSession({ session, index, onOpenSession, featured = true }: { readonly session: SessionFeedItem; readonly index: number; readonly onOpenSession: SessionsViewProps["onOpenSession"]; readonly featured?: boolean }) {
  const selectTimelineSession = useSessionsUiStore((state) => state.selectTimelineSession);
  return <div className={styles.feature} data-timeline-expanded={featured || undefined}>
    <div className={styles.hero} data-timeline-reveal="hero"><Image src={sessionArtwork(session, index)} alt="" fill sizes="(min-width: 1200px) 72vw, 85vw" className={styles.photo} priority={index === 0} /></div>
    <div className={styles.featureStatus} data-timeline-reveal="detail"><Status session={session} /></div>
    <div className={styles.cardBody}>
      <h2 data-timeline-reveal="title">{sessionTitle(session)}</h2>
      <p className={styles.venue} data-timeline-reveal="venue">{session.venueName}{session.region && <> <span>·</span> {session.region}</>}</p>
      <div className={styles.summaryFooter}><Metadata session={session} /><button type="button" className={styles.viewDetails} data-timeline-reveal="action" onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); selectTimelineSession(session.sessionId); onOpenSession(session); }}>View details<ArrowRight size={20} strokeWidth={1.5} aria-hidden /></button></div>
    </div>
  </div>;
}

interface TimelineProgress { readonly from: string; readonly to: string; readonly mix: number }

function expansionFor(progress: TimelineProgress, id: string) {
  return progress.from === progress.to ? Number(id === progress.from)
    : id === progress.from ? 1 - progress.mix : id === progress.to ? progress.mix : 0;
}

/** Native scroll transfers a constant amount of featured space between adjacent rows. */
function JoinedTimeline({ sessions: feedSessions, asOf, onOpenSession, scrollTargetId, onUrlRestored, entrancePlayed }: SessionsViewProps & { readonly entrancePlayed: RefObject<boolean> }) {
  const sessions = useMemo(() => [...feedSessions].sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt) || left.sessionId.localeCompare(right.sessionId)), [feedSessions]);
  const defaultSession = sessions.find((session) => session.section === "upcoming") ?? sessions.at(-1);
  const activeSessionId = useSessionsUiStore((state) => state.activeSessionId);
  const active = sessions.some((session) => session.sessionId === activeSessionId) ? activeSessionId! : defaultSession?.sessionId ?? "";
  const setActive = useSessionsUiStore((state) => state.selectTimelineSession);
  const [progress, setProgress] = useState<TimelineProgress>({ from: active, to: active, mix: 0 });
  const progressRef = useRef(progress);
  const selected = useRef(active);
  const navigationTarget = useRef<string | null>(null);
  const dialogOpen = useRef(false);
  const [marker, setMarker] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const positions = useRef<{ id: string; top: number }[]>([]);
  const positioned = useRef(false);
  const viewportAnchor = useRef<{ id: string; top: number } | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const entrance = useTimelineEntrance({ root: list, played: entrancePlayed, marker, restoring: Boolean(scrollTargetId), activeSessionId: active });

  const readScroll = useCallback(() => {
    const stops = positions.current;
    if (!stops.length || !window.matchMedia("(min-width: 768px)").matches || dialogOpen.current || document.querySelector('[role="dialog"],dialog[open]')) return;
    const y = window.scrollY;
    let index = stops.findIndex((stop) => stop.top > y);
    if (index < 0) index = stops.length;
    const from = stops[Math.max(0, index - 1)]!;
    const to = stops[Math.min(stops.length - 1, index)]!;
    const distance = to.top - from.top;
    const fraction = distance > 0 ? Math.max(0, Math.min(1, (y - from.top) / distance)) : 0;
    // Round only subpixel endpoint differences from the browser's scroll range.
    const mix = fraction * distance < 1 ? 0 : (1 - fraction) * distance < 1 ? 1 : fraction;
    const next = { from: from.id, to: to.id, mix };
    const previous = progressRef.current;
    if (previous.from !== next.from || previous.to !== next.to || previous.mix !== next.mix) {
      progressRef.current = next;
      setProgress(next);
    }
    const requested = stops.find((stop) => stop.id === navigationTarget.current);
    if (requested && Math.abs(y - requested.top) > 1) return;
    navigationTarget.current = null;
    const id = mix < .5 ? from.id : to.id;
    if (selected.current !== id) {
      selected.current = id;
      setActive(id);
    }
  }, [setActive]);

  const select = useCallback((id: string) => {
    const stop = positions.current.find((position) => position.id === id);
    if (!stop) return;
    navigationTarget.current = id;
    setActive(id);
    // Explicit date/keyboard navigation uses the same native scroll path. Wheel,
    // trackpad, scrollbar and momentum input never get cancelled or repositioned.
    window.scrollTo({ top: stop.top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    // A refreshed feed can put the requested row at the current scroll offset;
    // no native scroll event is emitted in that case, but progress still changes.
    readScroll();
  }, [setActive, readScroll]);

  useLayoutEffect(() => {
    selected.current = active;
    if (pendingFocus.current) {
      rows.current.get(pendingFocus.current)?.querySelector<HTMLButtonElement>("[data-date-control]")?.focus({ preventScroll: true });
      pendingFocus.current = null;
    }
    const root = list.current;
    if (!root) return;
    const center = (id: string) => {
      const day = rows.current.get(id)?.querySelector<HTMLElement>("[data-date-control] time strong");
      if (!day) return 0;
      const bounds = day.getBoundingClientRect();
      return bounds.top - root.getBoundingClientRect().top + bounds.height / 2;
    };
    setMarker(center(progress.from) * (1 - progress.mix) + center(progress.to) * progress.mix);
  }, [active, progress, sessions]);

  useLayoutEffect(() => {
    const row = rows.current.get(active);
    if (row) viewportAnchor.current = { id: active, top: row.getBoundingClientRect().top };
  }, [active, progress]);

  useLayoutEffect(() => {
    const root = list.current;
    const header = root?.closest("[data-view]")?.querySelector("header");
    if (!root || !header) return;
    const desktop = window.matchMedia("(min-width: 768px)");
    let previousWidth = -1;
    let previousHeight = -1;
    const measure = (initial = false) => {
      if (!desktop.matches) return;
      // Natural content is measured independently of its clipped slot. The same
      // featured height is reserved across the feed, so total height stays fixed
      // as its two expansion weights sum to one (including during reversal).
      const height = Math.max(112, ...Array.from(root.querySelectorAll<HTMLElement>("[data-timeline-feature]"), (feature) => feature.offsetHeight));
      const width = root.getBoundingClientRect().width;
      if (!initial && width === previousWidth && height === previousHeight) return;
      previousWidth = width;
      previousHeight = height;
      const currentRow = rows.current.get(selected.current);
      const anchor = initial ? viewportAnchor.current : currentRow ? { id: selected.current, top: currentRow.getBoundingClientRect().top } : null;
      const readingTop = (parseFloat(getComputedStyle(header).top) || 0) + header.getBoundingClientRect().height + 28;
      const extra = Math.max(0, height - 112);
      root.style.setProperty("--feature-extra", `${extra}px`);
      root.style.setProperty("--feature-height", `${height}px`);
      root.style.setProperty("--reading-top", `${readingTop}px`);
      let expansionAbove = 0;
      positions.current = sessions.flatMap((session) => {
        const row = rows.current.get(session.sessionId);
        if (!row) return [];
        const heading = row.previousElementSibling;
        const labelSpace = heading?.matches("h2") ? heading.getBoundingClientRect().height : 0;
        const top = row.getBoundingClientRect().top + window.scrollY - expansionAbove * extra - readingTop - labelSpace;
        expansionAbove += expansionFor(progressRef.current, session.sessionId);
        return [{ id: session.sessionId, top: Math.max(0, top) }];
      });
      const target = scrollTargetId ?? (!positioned.current ? selected.current : null);
      if (target) {
        const stop = positions.current.find((position) => position.id === target);
        if (stop) {
          const next = { from: target, to: target, mix: 0 };
          progressRef.current = next;
          setProgress(next);
          // Entry and deep-link restoration are the only selection-driven jumps.
          // This happens before paint, including when the restored page arrives.
          window.scrollTo({ top: stop.top, behavior: "instant" });
          positioned.current = true;
          if (scrollTargetId) onUrlRestored?.();
        }
      } else if (anchor) {
        // Older pagination inserts rows above the viewport. Preserve that visual
        // anchor once; ordinary progress never writes to the scroll position.
        const row = rows.current.get(anchor.id);
        if (row) {
          const correction = row.getBoundingClientRect().top - anchor.top;
          if (Math.abs(correction) > .5) window.scrollBy({ top: correction, behavior: "instant" });
        }
      }
      readScroll();
      // Geometry can change without changing the selected ID or scroll fraction
      // (for example, prepended history). Remeasure the marker before paint too.
      setProgress({ ...progressRef.current });
    };
    measure(true);
    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => measure());
    });
    observer.observe(root);
    root.querySelectorAll<HTMLElement>("[data-timeline-feature]").forEach((feature) => observer.observe(feature));
    const onResize = () => { previousWidth = -1; measure(); };
    window.addEventListener("resize", onResize);
    return () => { observer.disconnect(); cancelAnimationFrame(resizeFrame); window.removeEventListener("resize", onResize); };
  }, [sessions, scrollTargetId, onUrlRestored, readScroll]);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      const row = rows.current.get(selected.current);
      if (row && !dialogOpen.current) viewportAnchor.current = { id: selected.current, top: row.getBoundingClientRect().top };
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; readScroll(); });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // Let new native input immediately take over an explicit smooth date seek.
    // These passive listeners never cancel input or perform a selection.
    const releaseSeek = (event: Event) => {
      if (dialogOpen.current || document.querySelector('[role="dialog"],dialog[open]')) return;
      if (event instanceof KeyboardEvent && list.current?.contains(event.target instanceof Node ? event.target : null) && ["PageUp", "ArrowUp", "Home", "PageDown", "ArrowDown", "End"].includes(event.key)) return;
      // Cancel an unfinished explicit seek at its CURRENT position. This has
      // zero displacement and leaves the incoming native gesture in control.
      if (navigationTarget.current) window.scrollTo({ top: window.scrollY, behavior: "instant" });
      if (event.type === "pointerdown" && event.target instanceof Element && event.target.closest('aside,[aria-label="Session views"]')) return;
      navigationTarget.current = null;
      readScroll();
    };
    window.addEventListener("wheel", releaseSeek, { passive: true });
    window.addEventListener("pointerdown", releaseSeek, { passive: true });
    window.addEventListener("keydown", releaseSeek, { capture: true });
    // A modal's scroll lock and focus restoration are not timeline movement.
    // Resume an explicit selection only after the portal and its lock leave.
    let dialogFrame = 0;
    const dialogs = new MutationObserver(() => {
      if (document.querySelector('[role="dialog"],dialog[open]')) { dialogOpen.current = true; return; }
      if (!dialogOpen.current) return;
      cancelAnimationFrame(dialogFrame);
      dialogFrame = requestAnimationFrame(() => {
        dialogOpen.current = false;
        const target = navigationTarget.current ?? (expansionFor(progressRef.current, selected.current) < .5 ? selected.current : null);
        const stop = positions.current.find((position) => position.id === target);
        if (stop) {
          navigationTarget.current = stop.id;
          window.scrollTo({ top: stop.top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
        } else readScroll();
      });
    });
    dialogs.observe(document.body, { childList: true });
    return () => {
      dialogs.disconnect();
      cancelAnimationFrame(dialogFrame);
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", releaseSeek);
      window.removeEventListener("pointerdown", releaseSeek);
      window.removeEventListener("keydown", releaseSeek, { capture: true });
    };
  }, [readScroll]);

  const onKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!window.matchMedia("(min-width: 768px)").matches || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || document.querySelector('[role="dialog"],dialog[open]')) return;
    if (!(event.target instanceof Element) || event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="listbox"],[role="menu"],[role="slider"]')) return;
    for (let node: Element | null = event.target; node && node !== event.currentTarget; node = node.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return;
    }
    if (!["PageUp", "ArrowUp", "Home", "PageDown", "ArrowDown", "End"].includes(event.key)) return;
    const index = sessions.findIndex((session) => session.sessionId === active);
    const target = sessions[event.key === "Home" ? 0 : event.key === "End" ? sessions.length - 1 : index + (["PageDown", "ArrowDown"].includes(event.key) ? 1 : -1)];
    if (!target || target.sessionId === active) return;
    event.preventDefault();
    pendingFocus.current = target.sessionId;
    select(target.sessionId);
  };

  return <div className={styles.timeline} ref={list} role="region" aria-label="Joined session timeline" data-timeline-entrance={entrance.phase} onKeyDown={onKey} onPointerDownCapture={entrance.finish} onFocusCapture={entrance.finish}>
    <div className={styles.rail} data-timeline-rail aria-hidden />
    <span className={styles.railProgress} style={{ height: `${Math.max(0, marker - 32)}px` }} aria-hidden />
    <span data-timeline-marker className={styles.activeDot} style={{ "--marker-y": `${marker}px` } as CSSProperties} aria-hidden />
    {sessions.map((session, index) => {
      const label = timelineGroup(session, asOf);
      const artworkIndex = feedSessions.findIndex((item) => item.sessionId === session.sessionId);
      const previous = sessions[index - 1];
      const expanded = session.sessionId === active;
      const expansion = expansionFor(progress, session.sessionId);
      return <Fragment key={session.sessionId}>
        {(!previous || timelineGroup(previous, asOf) !== label) && <h2 className={styles.groupLabel} data-timeline-reveal="label">{label}</h2>}
        <div className={styles.timelineRow} style={{ "--expansion": expansion } as CSSProperties} ref={(element) => { if (element) rows.current.set(session.sessionId, element); else rows.current.delete(session.sessionId); }} data-current={expanded || undefined} data-section={session.section} data-session-id={session.sessionId}>
          <button type="button" data-date-control data-timeline-reveal="date" className={styles.dateButton} onClick={() => select(session.sessionId)} aria-label={`Show ${sessionTitle(session)}, ${sessionDate(session.startAt).full}`} aria-expanded={expanded} aria-controls={`timeline-card-${session.sessionId}`}><span className={styles.dot} aria-hidden /><DateStamp value={session.startAt} /></button>
          <article id={`timeline-card-${session.sessionId}`} className={styles.timelineCard} aria-label={`${sessionTitle(session)} at ${session.venueName}`}>
            <div className={styles.timelineFeature} style={{ visibility: expansion > 0 ? "visible" : "hidden" }} data-timeline-feature aria-hidden={!expanded} inert={!expanded}><ExpandedSession session={session} index={artworkIndex} onOpenSession={onOpenSession} featured={expanded} /></div>
            {!expanded && <button type="button" className={styles.collapsedCard} data-timeline-reveal="row" aria-hidden={expansion > 0} inert={expansion > 0} onClick={(event) => { if (document.activeElement === event.currentTarget) pendingFocus.current = session.sessionId; select(session.sessionId); }} aria-expanded={false} aria-controls={`timeline-card-${session.sessionId}`} aria-label={`Expand ${sessionTitle(session)} at ${session.venueName}`}>
              <span className={styles.collapsedCopy}><strong>{session.venueName}</strong><span className={styles.collapsedTime}><span className="sr-only">Singapore time: </span>{sessionTime(session)}</span></span>
              <span className={styles.collapsedPlayers}><UsersRound size={22} strokeWidth={1.5} aria-hidden /><span>{session.participantCount} / {session.capacity}<span className="sr-only"> players</span></span></span>
              <ChevronDown size={18} strokeWidth={1.5} aria-hidden />
            </button>}
          </article>
        </div>
      </Fragment>;
    })}
  </div>;
}

function HostingSessions({ sessions, upcomingCount, pastCount, onOpenSession, onLoadMore, hasMore, loadingMore }: SessionsViewProps) {
  const carousel = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const advanceAfterLoad = useRef(false);
  const upcoming = sessions.filter((session) => session.section === "upcoming");
  const past = sessions.filter((session) => session.section === "past");
  const scrollCards = (direction: number) => {
    const el = carousel.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  useLayoutEffect(() => {
    const el = carousel.current;
    if (!el) return;
    if (advanceAfterLoad.current) { advanceAfterLoad.current = false; scrollCards(1); }
    const measure = () => setEdges({ start: el.scrollLeft <= 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => { el.removeEventListener("scroll", measure); observer.disconnect(); };
  }, [upcoming.length]);
  return <div className={styles.hosting}>
    <section aria-labelledby="upcoming-heading">
      <div className={styles.hostingSectionHeader}><h2 id="upcoming-heading" className={styles.sectionHeading}>Upcoming <span>({upcomingCount})</span></h2>
        {upcoming.length > 0 && <div className={styles.carouselControls}>
          <button type="button" aria-label="Previous upcoming sessions" disabled={edges.start} onClick={() => scrollCards(-1)}><ChevronLeft size={19} strokeWidth={1.5} aria-hidden /></button>
          <button type="button" aria-label="Next upcoming sessions" disabled={edges.end && (upcomingCount <= upcoming.length || !hasMore || loadingMore)} onClick={() => { if (edges.end && hasMore && !loadingMore) { advanceAfterLoad.current = true; onLoadMore(); } else scrollCards(1); }}><ChevronRight size={19} strokeWidth={1.5} aria-hidden /></button>
        </div>}
      </div>
      {upcoming.length === 0 ? <p className={styles.sectionEmpty}>No upcoming sessions. Your next game is yours to plan.</p> : <ul ref={carousel} className={styles.upcomingCards}>
        {upcoming.map((session, index) => <li key={session.sessionId} className={styles.hostingCard}>
          <button type="button" onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); onOpenSession(session); }} aria-label={`Manage ${sessionTitle(session)} at ${session.venueName}`}>
            <time className={styles.hostingDate} dateTime={session.startAt}>{sessionDate(session.startAt).weekday} {sessionDate(session.startAt).day} {sessionDate(session.startAt).month}</time>
            <span className={styles.hostingHero}><Image src={sessionArtwork(session, index)} alt="" fill sizes="(min-width: 1400px) 400px, 40vw" className={styles.photo} /></span>
            <span className={styles.hostingBody}><span className={styles.hostingTitle}><strong>{session.venueName}</strong><ChevronRight size={18} strokeWidth={1.4} aria-hidden /></span><span className={styles.venue}>{session.sport}{session.region && <> · {session.region}</>}</span><span className={styles.hostingMeta}><span>{sessionTime(session)}</span><span>{session.participantCount} / {session.capacity} players</span></span></span>
          </button>
        </li>)}
      </ul>}
    </section>
    <section className={styles.past} aria-labelledby="past-heading"><h2 id="past-heading" className={styles.sectionHeading}>Past <span>({pastCount})</span></h2>
      {past.length === 0 ? <p className={styles.sectionEmpty}>{pastCount > 0 ? "Keep scrolling to load your past sessions." : "Your past sessions will appear here."}</p> : <ul className={styles.pastList}>{past.map((session, index) => <li key={session.sessionId}><button type="button" className={styles.pastRow} onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); onOpenSession(session); }} aria-label={`View ${sessionTitle(session)} at ${session.venueName}, ${sessionDate(session.startAt).full}`}>
        <DateStamp value={session.startAt} /><span className={styles.pastThumbnail}><Image src={sessionArtwork(session, index)} alt="" fill sizes="140px" className={styles.photo} /></span><span className={styles.pastCopy}><strong>{session.venueName}</strong><span>{session.sport}{session.region && <> · {session.region}</>}</span></span><span className={styles.pastTime}>{sessionTime(session)}</span><span className={styles.pastCount}>{session.participantCount} / {session.capacity}</span><Status session={session} /><ChevronRight size={19} strokeWidth={1.4} aria-hidden />
      </button></li>)}</ul>}
    </section>
  </div>;
}

function FeedPagination({ hasMore, loadingMore, onLoadMore, error, onRetry, edge = "end" }: SessionsViewProps & { readonly edge?: "start" | "end" }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const request = useRef({ loadingMore, onLoadMore });
  useEffect(() => { request.current = { loadingMore, onLoadMore }; }, [loadingMore, onLoadMore]);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || error) return;
    // Keep the observer across requests. A horizontal hosting carousel doesn't
    // grow vertically, so re-observing after every response would drain all pages.
    const observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting && !request.current.loadingMore) request.current.onLoadMore(); }, { rootMargin: edge === "start" ? "300px 0px 0px 0px" : "0px 0px 300px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, error, edge]);
  return <div ref={sentinel} className={styles.pagination}>
    {error ? <><p role="alert">{error}</p><button className={styles.secondaryButton} onClick={onRetry}>Try again</button></> : hasMore ? <button className={styles.secondaryButton} disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? "Loading sessions…" : "Load more sessions"}</button> : null}
  </div>;
}
