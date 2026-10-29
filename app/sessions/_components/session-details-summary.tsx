import { CalendarDays, Clock3, MapPin, ArrowUpRight } from "lucide-react";
import type { SessionFeedItem } from "../session-feed-contract";
import { sessionDuration, sessionLongDate, sessionTime } from "./session-display";
import styles from "./session-details.module.css";

/** The same authenticated facts for hosts, players, and session history. */
export function SessionDetailsSummary({ session }: { readonly session: SessionFeedItem }) {
  return <div className={styles.summary}>
    <div className={styles.fact}><CalendarDays aria-hidden /><p className={styles.date}><time dateTime={session.startAt}>{sessionLongDate(session.startAt)}</time></p></div>
    <div className={styles.fact}><Clock3 aria-hidden /><p className={styles.time}><span>{sessionTime(session)}</span><span className={styles.duration}>· {sessionDuration(session)}</span><span className={styles.zone}>Singapore time</span></p></div>
    <div className={styles.fact}><MapPin aria-hidden /><div className={styles.location}>
      <a href={`https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: `${session.venueName}, Singapore` })}`} target="_blank" rel="noreferrer">{session.venueName}<ArrowUpRight size={14} aria-hidden /><span className="sr-only"> (opens in a new tab)</span></a>
      {session.region && <p>{session.region}</p>}
    </div></div>
  </div>;
}
