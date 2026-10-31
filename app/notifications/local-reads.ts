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
      if (
        value &&
        typeof value === "object" &&
        "read" in value &&
        value.read &&
        typeof value.read === "object"
      ) {
        this.state = {
          read: Object.fromEntries(
            Object.entries(value.read).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === "string" &&
                Number.isFinite(Date.parse(entry[1])),
            ),
          ),
          through: watermark("through" in value ? value.through : undefined),
          visited: watermark("visited" in value ? value.visited : undefined),
        };
      } else this.state = { read: {} };
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
      this.state.through = { id: item.id, createdAt: item.createdAt };
      this.state.read = {};
      this.save();
    }
  }
  visit(item?: NotificationItem) {
    if (item && newer(item, this.state.visited)) {
      this.state.visited = { id: item.id, createdAt: item.createdAt };
      this.save();
    }
  }
  prune(cutoff: string) {
    for (const [id, time] of Object.entries(this.state.read))
      if (Date.parse(time) < Date.parse(cutoff)) delete this.state.read[id];
    if (
      this.state.through &&
      Date.parse(this.state.through.createdAt) < Date.parse(cutoff)
    )
      delete this.state.through;
    if (
      this.state.visited &&
      Date.parse(this.state.visited.createdAt) < Date.parse(cutoff)
    )
      delete this.state.visited;
    this.save();
  }
}

function watermark(value: unknown): Watermark | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !("createdAt" in value) ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt))
  )
    return undefined;
  return { id: value.id, createdAt: new Date(value.createdAt).toISOString() };
}
