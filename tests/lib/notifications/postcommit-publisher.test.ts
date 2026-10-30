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
