import { describe, expect, test, vi } from "vitest";
import { InboxNotifier } from "@/lib/notifications/inbox-notifier";
import type { CommitmentNotification } from "@/use-cases/sessions/commitment-notifications";

const event: CommitmentNotification = { kind: "PROMOTED", recipientId: "player", sessionId: "session" };

describe("persistent commitment notifications", () => {
  test("saves alerts when browser push is not configured", async () => {
    const save = vi.fn(async () => {});
    await new InboxNotifier({ save }).notify([event]);
    expect(save).toHaveBeenCalledExactlyOnceWith(event);
  });

  test("push failure does not discard a saved inbox item", async () => {
    const save = vi.fn(async () => {});
    await expect(new InboxNotifier({ save }, { notify: async () => { throw new Error("push down"); } }).notify([event])).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledExactlyOnceWith(event);
  });

  test("attempts every recipient and push, then reports persistence failure for reminder retry", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("database down")).mockResolvedValue(undefined);
    const notify = vi.fn(async () => {});
    const second = { ...event, recipientId: "other" };
    await expect(new InboxNotifier({ save }, { notify }).notify([event, second])).rejects.toThrow("database down");
    expect(save).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledExactlyOnceWith([event, second]);
  });
});
