import { describe, expect, it, vi } from "vitest";
import { encodeNotificationIntent, renderNotification } from "@/lib/notifications/notification-presentation";
import type { SqlExecutor } from "@/lib/money/sql";
import { PostgresNotificationWriter } from "@/lib/notifications/postgres-notification-writer";

describe("transactional notifications", () => {
  it("preserves legacy action identities and truthfully distinguishes forfeiture from transfer", () => {
    const intent = { kind: "FORFEITURE_DUE" as const, recipientId: "person", sessionId: "session", occurrenceKey: "committed-action" };
    expect(encodeNotificationIntent(intent, "fallback").source_key).toBe(JSON.stringify(["FORFEITURE_DUE", "session", "committed-action"]));
    expect(renderNotification(intent).body).toContain("held");
    expect(renderNotification(intent).body).not.toContain("was transferred");
  });
  it("keeps routine group activity in the inbox and directs invitations to their exact group", () => {
    expect(renderNotification({ kind: "GROUP_MEMBER_JOINED", recipientId: "owner", groupId: "group" }).push).toBe(false);
    expect(renderNotification({ kind: "GROUP_INVITATION", recipientId: "invitee", groupId: "group" })).toMatchObject({ category: "groups", push: true, url: "/groups?invitation=group" });
  });
  it("records only inserted recipients and lets persistence failures reject the owning transaction", async () => {
    const recipients = new Set<string>();
    const query = vi.fn<SqlExecutor["query"]>().mockResolvedValue([{ recipient_id: "person" }]);
    const writer = new PostgresNotificationWriter({ query: query as SqlExecutor["query"] }, "action", recipients);
    await writer.append([{ kind: "WAITLIST_ENTERED", recipientId: "person", sessionId: "session" }]);
    expect(recipients).toEqual(new Set(["person"]));
    expect(query).toHaveBeenCalledOnce();
    const failed = new PostgresNotificationWriter({ query: async () => { throw new Error("storage unavailable"); } }, "action", new Set());
    await expect(failed.append([{ kind: "WAITLIST_ENTERED", recipientId: "person", sessionId: "session" }])).rejects.toThrow("storage unavailable");
  });
});
