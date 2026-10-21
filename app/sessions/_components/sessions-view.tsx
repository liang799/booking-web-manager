"use client";

import { ArrowRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3, ExternalLink, MapPin, Plus, UsersRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SessionFeedItem } from "../session-feed-contract";
import type { SessionAccountAction } from "../session-actions";
import { sessionArtwork, sessionCalendarHref, sessionDate, sessionStatus, sessionTime, sessionTitle, timelineGroup } from "./session-display";
import { useSessionsUiStore } from "./sessions-ui-provider";
import type { SessionDetailsPanel } from "./sessions-ui-store";
import styles from "./sessions.module.css";

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

/** A shared feed, with a scroll-led desktop timeline and a deliberately simple mobile list. */
export function SessionsView(props: SessionsViewProps) {
  const { tab, onTabChange, sessions, actions, loading, error, onRetry } = props;
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
    {loading ? <div className={styles.skeleton} role="status"><span className="sr-only">Loading your sessions…</span><div /><div /><div /></div>
      : error && sessions.length === 0 ? <div className={styles.empty}><p role="alert">{error}</p><button className={styles.secondaryButton} onClick={onRetry}>Try again</button></div>
      : sessions.length === 0 ? <EmptySessions tab={tab} actions={actions} />
      : <>
        <div className={styles.desktop}>
          {tab === "joined" ? <JoinedTimeline key={tab} {...props} /> : <HostingSessions {...props} />}
        </div>
        <ul className={styles.mobileList} aria-label={`${tab === "joined" ? "Joined" : "Hosting"} sessions`}>
          {sessions.map((session) => <li key={session.sessionId}><button type="button" className={styles.mobileCard} onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); props.onOpenSession(session); }} aria-label={`View ${sessionTitle(session)} at ${session.venueName}, ${sessionDate(session.startAt).full}`}>
            <DateStamp value={session.startAt} />
            <span className={styles.mobileCopy}><strong>{sessionTitle(session)}</strong><span>{session.venueName}</span><span>{sessionTime(session)}</span>{sessionStatus(session) !== "Joined" && sessionStatus(session) !== "Hosting" && <span className={styles.mobileStatus}>{sessionStatus(session)}</span>}</span>
          </button></li>)}
        </ul>
        <FeedPagination {...props} />
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

function Metadata({ session }: { readonly session: SessionFeedItem }) {
  return <span className={styles.metadata}>
    <span><Clock3 aria-hidden /><span className="sr-only">Singapore time: </span>{sessionTime(session)}</span>
    <span><UsersRound aria-hidden />{session.participantCount} / {session.capacity} players</span>
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

function ExpandedSession({ session, index, onOpenSession }: { readonly session: SessionFeedItem; readonly index: number; readonly onOpenSession: SessionsViewProps["onOpenSession"] }) {
  const selectTimelineSession = useSessionsUiStore((state) => state.selectTimelineSession);
  return <div className={styles.expandedCard}>
    <div className={styles.hero}><Image src={sessionArtwork(session, index)} alt="" fill sizes="(min-width: 1280px) 1000px, 70vw" className={styles.photo} priority={index === 0} /><Status session={session} /></div>
    <div className={styles.cardBody}>
      <h2>{sessionTitle(session)}</h2>
      <p className={styles.venue}>{session.venueName}{session.region && <> <span>·</span> {session.region}</>}</p>
      <div className={styles.summaryFooter}><Metadata session={session} /><button type="button" className={styles.viewDetails} onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); selectTimelineSession(session.sessionId); onOpenSession(session); }}>View details<ArrowRight size={20} strokeWidth={1.5} aria-hidden /></button></div>
    </div>
  </div>;
}

/** Scroll selection preserves the next card's position when the previous card folds away. */
function JoinedTimeline({ sessions, asOf, onOpenSession, scrollTargetId, onUrlRestored }: SessionsViewProps) {
  const activeSessionId = useSessionsUiStore((state) => state.activeSessionId);
  const active = sessions.some((session) => session.sessionId === activeSessionId) ? activeSessionId! : sessions[0]?.sessionId ?? "";
  const setActive = useSessionsUiStore((state) => state.selectTimelineSession);
  const [marker, setMarker] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const anchor = useRef<{ id: string; top: number } | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const lastScroll = useRef(0);
  const ignoreScroll = useRef(false);
  const lastSelection = useRef(0);
  const select = useCallback((id: string) => {
    if (id === active) { setActive(id); return; }
    const row = rows.current.get(id);
    if (row) anchor.current = { id, top: row.getBoundingClientRect().top };
    lastSelection.current = performance.now();
    setActive(id);
  }, [active, setActive]);

  useLayoutEffect(() => {
    if (anchor.current) {
      const row = rows.current.get(anchor.current.id);
      if (row) {
        ignoreScroll.current = true;
        window.scrollBy({ top: row.getBoundingClientRect().top - anchor.current.top, behavior: "instant" });
        lastScroll.current = window.scrollY;
      }
      anchor.current = null;
    }
    if (scrollTargetId === active && window.matchMedia("(min-width: 768px)").matches) {
      const target = rows.current.get(active);
      if (target) {
        ignoreScroll.current = true;
        target.scrollIntoView({ block: "start", behavior: "instant" });
        lastScroll.current = window.scrollY;
        onUrlRestored?.();
      }
    }
    if (pendingFocus.current) {
      rows.current.get(pendingFocus.current)?.querySelector<HTMLButtonElement>("[data-date-control]")?.focus({ preventScroll: true });
      pendingFocus.current = null;
    }
    const updateMarker = () => {
      const day = rows.current.get(active)?.querySelector<HTMLElement>("[data-date-control] time strong");
      const root = list.current;
      if (day && root) {
        const bounds = day.getBoundingClientRect();
        setMarker(bounds.top - root.getBoundingClientRect().top + bounds.height / 2);
      }
    };
    updateMarker();
    const observer = new ResizeObserver(updateMarker);
    if (list.current) observer.observe(list.current);
    const day = rows.current.get(active)?.querySelector<HTMLElement>("[data-date-control] time strong");
    if (day) observer.observe(day);
    const frame = requestAnimationFrame(() => { ignoreScroll.current = false; });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [active, sessions, scrollTargetId, onUrlRestored]);

  useEffect(() => {
    let frame = 0;
    lastScroll.current = window.scrollY;
    const onScroll = () => {
      // Dialog focus/scroll locking must not fold away the control that opened it.
      if (document.querySelector('[role="dialog"]')) { lastScroll.current = window.scrollY; return; }
      if (frame || ignoreScroll.current || !window.matchMedia("(min-width: 768px)").matches) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const direction = window.scrollY - lastScroll.current;
        lastScroll.current = window.scrollY;
        if (document.querySelector('[role="dialog"]')) return;
        if (Math.abs(direction) < 2 || (list.current?.contains(document.activeElement) && document.activeElement?.matches(":focus-visible"))) return;
        const index = sessions.findIndex((session) => session.sessionId === active);
        const next = sessions[index + (direction > 0 ? 1 : -1)];
        if (!next) return;
        const threshold = Math.min(window.innerHeight * .45, 650);
        const nextRow = rows.current.get(next.sessionId);
        const current = rows.current.get(active);
        const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
        if (direction > 0 && nextRow && (nextRow.getBoundingClientRect().top <= threshold || (atBottom && nextRow.getBoundingClientRect().top < window.innerHeight - 80))) select(next.sessionId);
        if (direction < 0 && current && current.getBoundingClientRect().top > threshold) select(next.sessionId);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // A folded card can exhaust the page's scroll range. Continue selection at
    // either boundary, where additional wheel/key/touch input emits no scroll event.
    const selectAtBoundary = (direction: 1 | -1) => {
      const atBoundary = direction < 0 ? window.scrollY <= 1 : window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
      if (!atBoundary || performance.now() - lastSelection.current < 550 || !window.matchMedia("(min-width: 768px)").matches) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      if (list.current?.contains(document.activeElement) && document.activeElement?.matches(":focus-visible")) return;
      const adjacent = sessions[sessions.findIndex((session) => session.sessionId === active) + direction];
      if (adjacent) select(adjacent.sessionId);
    };
    const onWheel = (event: WheelEvent) => { if (Math.abs(event.deltaY) > 8) selectAtBoundary(event.deltaY > 0 ? 1 : -1); };
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.matches("input,textarea,select,[contenteditable=true]")) return;
      if (event.key === "PageUp" || event.key === "ArrowUp" || event.key === "Home") selectAtBoundary(-1);
      if (event.key === "PageDown" || event.key === "ArrowDown" || event.key === "End") selectAtBoundary(1);
    };
    let touchY = 0;
    const onTouchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? 0; };
    const onTouchMove = (event: TouchEvent) => {
      const distance = (event.touches[0]?.clientY ?? 0) - touchY;
      if (Math.abs(distance) > 40) selectAtBoundary(distance < 0 ? 1 : -1);
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll); window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey); window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove); cancelAnimationFrame(frame);
    };
  }, [active, sessions, select]);

  return <div className={styles.timeline} ref={list} role="region" aria-label="Joined session timeline">
    <div className={styles.rail} aria-hidden />
    <span data-timeline-marker className={styles.activeDot} style={{ "--marker-y": `${marker}px` } as CSSProperties} aria-hidden />
    {sessions.map((session, index) => {
      const label = timelineGroup(session, asOf);
      const previous = sessions[index - 1];
      const expanded = session.sessionId === active;
      return <Fragment key={session.sessionId}>
        {(!previous || timelineGroup(previous, asOf) !== label) && <h2 className={styles.groupLabel}>{label}</h2>}
        <div className={styles.timelineRow} ref={(element) => { if (element) rows.current.set(session.sessionId, element); else rows.current.delete(session.sessionId); }} data-current={expanded || undefined} data-section={session.section} data-session-id={session.sessionId}>
          <button type="button" data-date-control className={styles.dateButton} onClick={() => select(session.sessionId)} aria-label={`Show ${sessionTitle(session)}, ${sessionDate(session.startAt).full}`} aria-expanded={expanded} aria-controls={`timeline-card-${session.sessionId}`}><span className={styles.dot} aria-hidden /><DateStamp value={session.startAt} /></button>
          <article id={`timeline-card-${session.sessionId}`} className={styles.timelineCard} aria-label={`${sessionTitle(session)} at ${session.venueName}`}>
            {expanded ? <ExpandedSession session={session} index={index} onOpenSession={onOpenSession} /> : <button type="button" className={styles.collapsedCard} onClick={(event) => { if (document.activeElement === event.currentTarget) pendingFocus.current = session.sessionId; select(session.sessionId); }} aria-expanded={false} aria-controls={`timeline-card-${session.sessionId}`} aria-label={`Expand ${sessionTitle(session)} at ${session.venueName}`}>
              <span className={styles.collapsedCopy}><strong>{session.venueName}</strong><span>{sessionTime(session)}</span></span>
              <span className={styles.collapsedPlayers}><UsersRound size={18} aria-hidden />{session.participantCount} / {session.capacity}</span>
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

function FeedPagination({ hasMore, loadingMore, onLoadMore, error, onRetry }: SessionsViewProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const request = useRef({ loadingMore, onLoadMore });
  useEffect(() => { request.current = { loadingMore, onLoadMore }; }, [loadingMore, onLoadMore]);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || error) return;
    // Keep the observer across requests. A horizontal hosting carousel doesn't
    // grow vertically, so re-observing after every response would drain all pages.
    const observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting && !request.current.loadingMore) request.current.onLoadMore(); }, { rootMargin: "0px 0px 300px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, error]);
  return <div ref={sentinel} className={styles.pagination}>
    {error ? <><p role="alert">{error}</p><button className={styles.secondaryButton} onClick={onRetry}>Try again</button></> : hasMore ? <button className={styles.secondaryButton} disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? "Loading sessions…" : "Load more sessions"}</button> : null}
  </div>;
}
