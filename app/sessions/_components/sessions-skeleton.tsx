import layout from "./sessions.module.css";
import styles from "./sessions-skeleton.module.css";

function Block({ className = "" }: { readonly className?: string }) {
  return <span className={`${styles.block} ${className}`} />;
}

function DatePlaceholder({ current = false }: { readonly current?: boolean }) {
  return <div className={`${styles.date} ${current ? styles.currentDate : ""}`}>
    <Block className={styles.weekday} /><Block className={styles.day} /><Block className={styles.month} />
  </div>;
}

function SummaryPlaceholder() {
  return <><Block className={styles.title} /><Block className={styles.subtitle} />
    <div className={styles.metadata}><Block /><Block /><Block className={styles.action} /></div>
  </>;
}

/** Mirrors the feed's geometry without exposing fake session facts or controls. */
export function SessionsSkeleton({ tab }: { readonly tab: "joined" | "hosting" }) {
  return <div role="status" data-sessions-skeleton={tab}>
    <span className="sr-only">Loading your sessions…</span>
    <div className={`${layout.desktop} ${styles.graphics}`} data-skeleton-desktop aria-hidden="true" inert>
      {tab === "joined" ? <div className={styles.timeline} data-skeleton-timeline>
        <div className={styles.rail} />
        <Block className={styles.group} />
        <div className={`${layout.timelineRow} ${styles.currentRow}`}>
          <DatePlaceholder current />
          <div className={styles.summary}><Block className={styles.hero} /><SummaryPlaceholder /></div>
        </div>
        {[0, 1].map((row) => <div className={layout.timelineRow} key={row}>
          <DatePlaceholder />
          <div className={styles.collapsed}><div><Block className={styles.rowTitle} /><Block className={styles.rowSubtitle} /></div><Block className={styles.count} /></div>
        </div>)}
      </div> : <div className={layout.hosting} data-skeleton-hosting>
        <Block className={styles.sectionHeading} />
        <div className={layout.upcomingCards}>
          {[0, 1, 2].map((card) => <div className={layout.hostingCard} key={card}>
            <Block className={styles.hostingDate} /><Block className={styles.hostingHero} />
            <Block className={styles.hostingTitle} /><Block className={styles.subtitle} />
            <div className={styles.metadata}><Block /><Block className={styles.count} /></div>
          </div>)}
        </div>
        <div className={layout.past}>
          <Block className={styles.sectionHeading} />
          {[0, 1, 2].map((row) => <div className={styles.pastRow} key={row}>
            <DatePlaceholder /><Block className={styles.thumbnail} />
            <div className={styles.pastCopy}><Block className={styles.rowTitle} /><Block className={styles.rowSubtitle} /></div>
            <Block className={styles.pastTime} /><Block className={styles.count} />
          </div>)}
        </div>
      </div>}
    </div>
    <div className={`${layout.mobileList} ${styles.graphics}`} data-skeleton-mobile aria-hidden="true" inert>
      {[0, 1, 2].map((row) => <div className={layout.mobileCard} key={row}>
        <div className={styles.mobileDate}><Block className={styles.day} /><Block className={styles.month} /></div>
        <div className={styles.mobileCopy}><Block className={styles.rowTitle} /><Block className={styles.rowSubtitle} /><Block className={styles.mobileTime} /></div>
      </div>)}
    </div>
  </div>;
}

/** The dialog title and Close button remain usable while host controls load. */
export function SessionControlsSkeleton() {
  return <div role="status" data-session-controls-skeleton>
    <span className="sr-only">Loading session controls…</span>
    <div className={`${styles.controls} ${styles.graphics}`} aria-hidden="true" inert>
      <div className={styles.controlsHeading}><Block className={styles.title} /><Block className={styles.badge} /></div>
      <Block className={styles.subtitle} /><Block className={styles.controlLine} /><Block className={styles.rowSubtitle} />
      <div className={styles.controlActions}><Block /><Block /><Block /></div>
      <Block className={styles.invitation} />
    </div>
  </div>;
}
