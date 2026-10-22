import type { SessionFeedItem } from "../session-feed-contract";
import { sportImage } from "@/lib/sessions/sport-image";

const zone = { timeZone: "Asia/Singapore" };
const date = new Intl.DateTimeFormat("en-SG", { ...zone, day: "numeric", month: "short", year: "numeric" });
const time = new Intl.DateTimeFormat("en-US", { ...zone, hour: "numeric", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat("en-SG", { ...zone, weekday: "short" });
const month = new Intl.DateTimeFormat("en-SG", { ...zone, month: "short" });
const day = new Intl.DateTimeFormat("en-SG", { ...zone, day: "numeric" });

export function sessionDate(value: string) {
  const instant = new Date(value);
  return { weekday: weekday.format(instant), day: day.format(instant), month: month.format(instant), full: date.format(instant) };
}

export function sessionTime(session: Pick<SessionFeedItem, "startAt" | "endAt">) {
  const start = new Date(session.startAt);
  const end = new Date(session.endAt);
  return `${time.format(start)} – ${date.format(start) === date.format(end) ? "" : `${date.format(end)}, `}${time.format(end)}`;
}

export function sessionTitle(session: Pick<SessionFeedItem, "sport">) {
  return `${session.sport} ${session.sport === "Tennis" ? "Court Booking" : "Session"}`;
}

export function sessionArtwork(session: Pick<SessionFeedItem, "sport">, index = 0) {
  return session.sport === "Tennis" ? `/images/sessions/${index % 3 === 1 ? "bench" : "court"}.webp` : sportImage(session.sport);
}

export function sessionStatus(session: SessionFeedItem) {
  if (session.status === "CANCELLED") return "Cancelled";
  if (session.role === "HOST") return session.section === "upcoming" ? "Hosting" : session.unverifiedCount > 0 ? "Check attendance" : "Completed";
  if (session.participationStatus === "CANCELLED") return "Cancelled";
  if (session.participationStatus === "REMOVED") return "Removed";
  if (session.participationStatus === "WITHDRAWN") return "Withdrawn";
  if (session.participationStatus === "LEFT_WAITLIST") return "Left waitlist";
  if (session.participationStatus === "WAITLISTED") return session.section === "past" ? "Not admitted" : "Waitlisted";
  return session.section === "past" ? "Completed" : "Joined";
}

export function timelineGroup(session: SessionFeedItem, asOf: string) {
  const start = new Date(new Date(session.startAt).getTime() + 8 * 60 * 60 * 1000);
  const now = new Date(new Date(asOf).getTime() + 8 * 60 * 60 * 1000);
  const sameMonth = start.getUTCFullYear() === now.getUTCFullYear() && start.getUTCMonth() === now.getUTCMonth();
  if (session.section === "past") {
    if (start > now) return "Cancelled & previous bookings";
    return sameMonth ? "Earlier this month" : new Intl.DateTimeFormat("en-SG", { ...zone, month: "long", year: "numeric" }).format(new Date(session.startAt));
  }
  const weekStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (now.getUTCDay() + 6) % 7);
  return start.getTime() < weekStart + 7 * 86400000 ? "This week" : "Coming up";
}

/** Calendar links include only the facts supplied by the authenticated session feed. */
export function sessionCalendarHref(session: SessionFeedItem) {
  const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: "TEMPLATE", text: sessionTitle(session), location: session.venueName,
    dates: `${stamp(session.startAt)}/${stamp(session.endAt)}`, ctz: "Asia/Singapore",
  })}`;
}
