import { describe, expect, it } from "vitest";
import { withNotificationPublication } from "@/lib/notifications/transaction-publication";

describe("committed notification publication", () => {
  it("waits for commit and coalesces recipients", async () => {
    const sent: string[][] = [];
    let commit!: () => void;
    const gate = new Promise<void>((resolve) => { commit = resolve; });
    const run = withNotificationPublication(async (recipients) => {
      recipients.add("user"); recipients.add("user");
      await gate; return "committed";
    }, (recipients) => { sent.push([...recipients]); });
    expect(sent).toEqual([]); commit();
    expect(await run).toBe("committed"); expect(sent).toEqual([["user"]]);
  });
  it("never publishes a rolled back change", async () => {
    const sent: string[][] = [];
    await expect(withNotificationPublication(async (recipients) => {
      recipients.add("user"); throw new Error("rollback");
    }, (recipients) => { sent.push([...recipients]); })).rejects.toThrow("rollback");
    expect(sent).toEqual([]);
  });
  it("publisher failure cannot change a committed result", async () => {
    const result = await withNotificationPublication(async (recipients) => {
      recipients.add("user"); return 42;
    }, () => { throw new Error("broadcast down"); });
    expect(result).toBe(42);
  });
  it("does not publish a replay with no newly inserted messages", async () => {
    let publications = 0;
    expect(await withNotificationPublication(async () => "replay", () => { publications++; })).toBe("replay");
    expect(publications).toBe(0);
  });
});
