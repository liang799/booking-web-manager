import { randomUUID } from "node:crypto";

export interface NotificationPushJob {
  readonly notificationId: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly kind: string;
  readonly attempts: number;
  readonly expiresAt: Date;
}
export interface NotificationPushStore {
  prune(): Promise<number>;
  claim(token: string): Promise<readonly NotificationPushJob[]>;
  current(job: NotificationPushJob, token: string): Promise<NotificationPushJob | null>;
  complete(job: NotificationPushJob, token: string): Promise<void>;
  retry(job: NotificationPushJob, token: string): Promise<void>;
  expireSubscription(job: NotificationPushJob, token: string): Promise<void>;
  release(token: string): Promise<void>;
  stats(): Promise<{ pending: number; oldestPendingAt: string | null }>;
}
export type NotificationPushSender = (job: NotificationPushJob, payload: string, ttlSeconds: number) => Promise<"DELIVERED" | "EXPIRED" | "FAILED" | "TERMINAL">;

/** Claims commit before sending; acknowledgements are fenced by a unique lease token. */
export async function dispatchNotificationPush(store: NotificationPushStore, send: NotificationPushSender | undefined, now = Date.now) {
  const report = { delivered:0,expired:0,retrying:0,failed:0,disabled:!send };
  const startedAt=now();
  await store.prune();
  if (!send) return { ...report,...await store.stats() };
  const token = randomUUID();
  const jobs = await store.claim(token);
  try {
    for (const claimed of jobs) {
      if (now()-startedAt >= 40_000) break;
      const job = await store.current(claimed,token);
      // Eligibility reads can wait on database work. Reserve five seconds for the send.
      if (now()-startedAt >= 40_000) break;
      if (!job || job.expiresAt.getTime()<=now()) {
        await store.complete(claimed,token); report.expired++; continue;
      }
      let result: Awaited<ReturnType<NotificationPushSender>>;
      try {
        result = await send(job,JSON.stringify({ notificationId:job.notificationId,title:job.title,body:job.body,url:job.url,kind:job.kind }),Math.max(1,Math.floor((job.expiresAt.getTime()-now())/1000)));
      } catch { result="FAILED"; }
      if (result==="DELIVERED") { await store.complete(job,token); report.delivered++; }
      else if (result==="EXPIRED") { await store.expireSubscription(job,token); report.expired++; }
      else if (result==="TERMINAL") { await store.complete(job,token); report.failed++; }
      else { await store.retry(job,token); report.retrying++; }
    }
  } finally { await store.release(token); }
  return { ...report,...await store.stats() };
}

export class NotificationPushDispatcher {
  constructor(private readonly store: NotificationPushStore,private readonly sender: NotificationPushSender | undefined) {}
  run() { return dispatchNotificationPush(this.store,this.sender); }
}
