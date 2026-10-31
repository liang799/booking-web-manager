import type { InboxPage } from "./transport";

/** Fetch a contiguous head, then retain the cached tail only once an overlap proves there is no gap. */
export async function reconcileNotificationPages(
  previous: InboxPage | null,
  read: (before: InboxPage["nextCursor"]) => Promise<InboxPage>,
): Promise<InboxPage> {
  let fresh = await read(null);
  const retained =
    previous?.items.filter(
      (item) => Date.parse(item.createdAt) >= Date.parse(fresh.retentionCutoff),
    ) ?? [];
  if (retained.length === 0) return fresh;
  const boundary = new Set(retained.map((item) => item.id));
  const seenCursors = new Set<string>();
  const incoming = [...fresh.items];
  while (!incoming.some((item) => boundary.has(item.id)) && fresh.nextCursor) {
    const key = JSON.stringify(fresh.nextCursor);
    if (seenCursors.has(key))
      throw new Error("Notification pagination did not advance. Try again.");
    seenCursors.add(key);
    fresh = await read(fresh.nextCursor);
    incoming.push(...fresh.items);
  }
  const overlaps = incoming.some((item) => boundary.has(item.id));
  const unique = new Map(
    [...incoming, ...(overlaps ? retained : [])].map((item) => [item.id, item]),
  );
  return {
    ...fresh,
    items: [...unique.values()].filter(
      (item) => Date.parse(item.createdAt) >= Date.parse(fresh.retentionCutoff),
    ),
    nextCursor: overlaps ? previous!.nextCursor : fresh.nextCursor,
  };
}
