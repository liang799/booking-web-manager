const zone = "Asia/Singapore";
const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });

export function notificationDate(value: string, now: string) {
  const date = new Date(value);
  const key = dateKey.format(date);
  const today = dateKey.format(new Date(now));
  const yesterday = dateKey.format(new Date(new Date(now).getTime() - 86_400_000));
  return {
    key,
    day: new Intl.DateTimeFormat("en-SG", { timeZone: zone, day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat("en-SG", { timeZone: zone, month: "short", year: "numeric" }).format(date).toUpperCase(),
    label: key === today ? "Today" : key === yesterday ? "Yesterday" : "Earlier",
  };
}

export function notificationTime(value: string, now: string) {
  const minutes = Math.max(0, Math.floor((Date.parse(now) - Date.parse(value)) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} hr ago`;
  return new Intl.DateTimeFormat("en-SG", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
