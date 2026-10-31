import { expect, it } from "vitest";
import { createPostCommitNotificationPublisher } from "@/lib/notifications/postcommit-publisher";

it("defers empty private hints and isolates failed publishing from committed work", async () => {
  const tasks: (()=>Promise<void>)[] = [], requests: RequestInit[] = [];
  const publish = createPostCommitNotificationPublisher({url:"https://example.supabase.co",serviceRoleKey:"server-only"}, (work)=>{tasks.push(work);}, async (_url, init)=>{requests.push(init ?? {});throw new Error("offline");});
  expect(()=>publish(["one","one","two"])).not.toThrow();
  expect(requests).toHaveLength(0);
  await expect(tasks[0]!()).resolves.toBeUndefined();
  expect(requests).toHaveLength(1);
  const body = JSON.parse(String(requests[0]!.body));
  expect(body.messages).toEqual([
    {topic:"user:one:notifications",event:"notifications_changed",payload:{},private:true},
    {topic:"user:two:notifications",event:"notifications_changed",payload:{},private:true},
  ]);
});
it("does not enqueue when settings are missing or let scheduler failure affect committed work", () => {
  let calls=0;
  createPostCommitNotificationPublisher(undefined,()=>{calls++;})(["one"]);
  expect(calls).toBe(0);
  expect(()=>createPostCommitNotificationPublisher({url:"https://example.supabase.co",serviceRoleKey:"key"},()=>{throw new Error("runtime ended");})(["one"])).not.toThrow();
});

it("splits deduplicated recipients into requests of at most 100 messages", async () => {
  const tasks: (() => Promise<void>)[] = [];
  const batches: { topic: string; event: string; payload: object; private: boolean }[][] = [];
  const recipients = Array.from({ length: 221 }, (_, index) => `recipient-${index}`);
  const publish = createPostCommitNotificationPublisher(
    { url: "https://example.supabase.co", serviceRoleKey: "server-only" },
    (work) => { tasks.push(work); },
    async (_url, init) => {
      batches.push(JSON.parse(String(init?.body)).messages);
      return new Response(null, { status: 202 });
    },
  );

  publish([...recipients, recipients[0]!, recipients[100]!]);
  expect(batches).toEqual([]);
  expect(tasks).toHaveLength(1);
  await tasks[0]!();

  expect(batches.map((batch) => batch.length)).toEqual([100, 100, 21]);
  expect(batches.flat()).toEqual(recipients.map((recipient) => ({
    topic: `user:${recipient}:notifications`, event: "notifications_changed", payload: {}, private: true,
  })));
});

it("uses one deadline for all chunks and stops when that deadline expires", async () => {
  const tasks: (() => Promise<void>)[] = [];
  const signals: (AbortSignal | null | undefined)[] = [];
  const publish = createPostCommitNotificationPublisher(
    { url: "https://example.supabase.co", serviceRoleKey: "server-only" },
    (work) => { tasks.push(work); },
    async (_url, init) => {
      signals.push(init?.signal);
      if (signals.length === 2) {
        // The publisher must not start another request after its existing deadline.
        await new Promise<void>((resolve) => init!.signal!.addEventListener("abort", () => resolve(), { once: true }));
      }
      return new Response(null, { status: 202 });
    },
  );

  publish(Array.from({ length: 201 }, (_, index) => `recipient-${index}`));
  await tasks[0]!();

  expect(signals).toHaveLength(2);
  expect(signals[0]).toBe(signals[1]);
  expect(signals[0]?.aborted).toBe(true);
});

it("continues with later recipients when one chunk is rejected", async () => {
  const tasks: (() => Promise<void>)[] = [];
  const batches: { topic: string }[][] = [];
  const publish = createPostCommitNotificationPublisher(
    { url: "https://example.supabase.co", serviceRoleKey: "server-only" },
    (work) => { tasks.push(work); },
    async (_url, init) => {
      batches.push(JSON.parse(String(init?.body)).messages);
      return new Response(null, { status: batches.length === 1 ? 503 : 202 });
    },
  );

  publish(Array.from({ length: 101 }, (_, index) => `recipient-${index}`));
  await expect(tasks[0]!()).resolves.toBeUndefined();

  expect(batches.map((batch) => batch.length)).toEqual([100, 1]);
  expect(batches[1]).toEqual([{ topic: "user:recipient-100:notifications", event: "notifications_changed", payload: {}, private: true }]);
});
