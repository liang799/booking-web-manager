import { expect, it } from "vitest";
import { dispatchNotificationPush, type NotificationPushJob, type NotificationPushStore } from "@/lib/notifications/push-dispatcher";

it("acknowledges only successful devices and retries partial failures without read-state decisions", async () => {
  const jobs = [job("ok"),job("failed"),job("expired"),job("stale")];
  const completed: string[] = [], retried: string[] = [], expired: string[] = [];
  const store: NotificationPushStore = {
    prune:async()=>0,claim: async () => jobs,
    current: async (candidate) => candidate.endpoint === "stale" ? null : candidate,
    complete: async (candidate) => { completed.push(candidate.endpoint); },
    retry: async (candidate) => { retried.push(candidate.endpoint); },
    expireSubscription: async (candidate) => { expired.push(candidate.endpoint); },
    release: async () => {}, stats: async () => ({ pending: 0, oldestPendingAt: null }),
  };
  const report = await dispatchNotificationPush(store, async (candidate) => candidate.endpoint === "ok" ? "DELIVERED" : candidate.endpoint === "expired" ? "EXPIRED" : "FAILED");
  expect(completed).toEqual(["ok","stale"]);
  expect(retried).toEqual(["failed"]);
  expect(expired).toEqual(["expired"]);
  expect(report).toMatchObject({ delivered:1,retrying:1,expired:2 });
});

it("leaves durable work available when push configuration is unavailable", async () => {
  let claimed = false;
  const store: NotificationPushStore = { prune:async()=>0,claim: async () => { claimed = true; return []; }, stats: async () => ({ pending:3,oldestPendingAt:"2026-10-30" }),
    current:async()=>null,complete:async()=>{},retry:async()=>{},expireSubscription:async()=>{},release:async()=>{} };
  expect(await dispatchNotificationPush(store, undefined)).toMatchObject({ disabled:true,pending:3 });
  expect(claimed).toBe(false);
});
function job(endpoint: string): NotificationPushJob {
  return { notificationId:endpoint, endpoint, p256dh:"key", auth:"auth", title:"Title",body:"Body",url:"/groups", kind:"GROUP_INVITATION",attempts:0,expiresAt:new Date(Date.now()+60_000) };
}

it("does not start a push after slow eligibility reads consume the run budget",async()=>{
  let clock=0,sent=0,released=false;
  const candidate=job("slow-read");
  const store:NotificationPushStore={prune:async()=>{clock=20_000;return 0;},claim:async()=>[candidate],
    current:async()=>{clock=41_000;return candidate;},complete:async()=>{},retry:async()=>{},expireSubscription:async()=>{},
    release:async()=>{released=true;},stats:async()=>({pending:1,oldestPendingAt:null})};
  await dispatchNotificationPush(store,async()=>{sent++;return "DELIVERED";},()=>clock);
  expect(sent).toBe(0);
  expect(released).toBe(true);
});
