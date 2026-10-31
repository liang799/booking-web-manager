import { describe, expect, it, vi } from "vitest";
import type { SqlExecutor, SqlRow } from "@/lib/money/sql";
import { PostgresDurableVerificationReminders } from "@/lib/commit/postgres-durable-verification-reminders";

describe("durable verification reminders", () => {
  it("publishes only after the claim and canonical message commit", async () => {
    const steps: string[] = [];
    const sql = { query: vi.fn(async (statement: string): Promise<SqlRow[]> => {
      if (statement.includes("update sessions")) { steps.push("claim"); return [{ session_id: "s", booker_id: "u" }]; }
      steps.push("inbox"); return [{ recipient_id: "u" }];
    }) } as SqlExecutor;
    const runner = new PostgresDurableVerificationReminders({ transaction: async (work) => {
      const result = await work(sql); steps.push("commit"); return result;
    } }, () => { steps.push("publish"); });
    expect(await runner.enqueueVerificationReminders(new Date(), 25)).toEqual([{ sessionId: "s", bookerId: "u" }]);
    expect(steps).toEqual(["claim", "inbox", "commit", "publish"]);
  });
  it("fails the whole transaction when canonical persistence fails", async () => {
    const steps: string[] = [];
    const sql = { query: vi.fn(async (statement: string): Promise<SqlRow[]> => {
      if (statement.includes("update sessions")) return [{ session_id: "s", booker_id: "u" }];
      throw new Error("inbox unavailable");
    }) } as SqlExecutor;
    const runner = new PostgresDurableVerificationReminders({ transaction: async (work) => {
      try { return await work(sql); } catch (error) { steps.push("rollback"); throw error; }
    } }, () => { steps.push("publish"); });
    await expect(runner.enqueueVerificationReminders(new Date(), 25)).rejects.toThrow("inbox unavailable");
    expect(steps).toEqual(["rollback"]);
  });
});
