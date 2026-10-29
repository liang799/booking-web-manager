import { CalendarDays, Clock3 } from "lucide-react";
import type { SessionFeedItem } from "../session-feed-contract";
import { sessionLongDate, sessionSummaryTime } from "./session-display";
import styles from "./session-details.module.css";

/** Timing for host management; the venue appears once in the dialog subtitle. */
export function SessionDetailsSummary({ session }: { readonly session: SessionFeedItem }) {
  return <div className={styles.summary}>
    <div className={styles.fact}><CalendarDays aria-hidden /><p className={styles.date}><time dateTime={session.startAt}>{sessionLongDate(session.startAt)}</time></p></div>
    <div className={styles.fact}><Clock3 aria-hidden /><p className={styles.time}>{sessionSummaryTime(session)}<span className="sr-only"> Singapore time</span></p></div>
  </div>;
}
