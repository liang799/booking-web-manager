import type { NotificationItem } from "./transport";

interface Watermark {
  createdAt: string;
  id: string;
}
interface State {
  read: Record<string, string>;
  through?: Watermark;
  visited?: Watermark;
}
const newer = (a: Watermark, b?: Watermark) =>
  !b ||
  a.createdAt > b.createdAt ||
  (a.createdAt === b.createdAt && a.id > b.id);
export class LocalNotificationReads {
  readonly key: string;
  private state: State = { read: {} };
  constructor(
    userId: string,
    private readonly storage?: Pick<Storage, "getItem" | "setItem">,
  ) {
    this.key = `notifications:v1:${userId}`;
    this.reload();
  }
  reload() {
    try {
      const value: unknown = JSON.parse(
        this.storage?.getItem(this.key) ?? "null",
      );
      this.state =
        value &&
        typeof value === "object" &&
        "read" in value &&
        typeof value.read === "object" &&
        value.read !== null
          ? (value as State)
          : { read: {} };
    } catch {
      /* Browser storage is optional. */
    }
  }
  private save() {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.state));
    } catch {
      /* Keep this tab's state in memory. */
    }
  }
  isRead(item: NotificationItem) {
    return (
      Boolean(this.state.read[item.id]) || !newer(item, this.state.through)
    );
  }
  hasNew(item?: NotificationItem) {
    return Boolean(item && newer(item, this.state.visited));
  }
  markRead(item: NotificationItem) {
    this.state.read[item.id] = item.createdAt;
    this.save();
  }
  markAll(item?: NotificationItem) {
    if (item) {
      this.state.through = item;
      this.state.read = {};
      this.save();
    }
  }
  visit(item?: NotificationItem) {
    if (item && newer(item, this.state.visited)) {
      this.state.visited = item;
      this.save();
    }
  }
  prune(cutoff: string) {
    for (const [id, time] of Object.entries(this.state.read))
      if (time < cutoff) delete this.state.read[id];
    this.save();
  }
}
