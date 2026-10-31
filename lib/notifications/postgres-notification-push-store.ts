import type { Pool,QueryConfig } from "pg";
import type { SqlExecutor, SqlRow } from "@/lib/money/sql";
import type { NotificationPushJob, NotificationPushStore } from "./push-dispatcher";

const projection = `j.notification_id,j.endpoint,j.attempts,j.expires_at,n.kind,n.title,n.body,n.destination,s.p256dh,s.auth`;
const joins = `join notification_inbox n on n.id=j.notification_id
 join push_subscriptions s on s.endpoint=j.endpoint and s.user_id=n.recipient_id and s.created_at=j.subscription_created_at
 join profiles p on p.user_id=n.recipient_id and p.account_status='ACTIVE'`;
const relevant = `j.expires_at>clock_timestamp() and public.notification_push_relevant(n.kind,n.recipient_id,n.session_id,n.group_id)`;

export class PostgresNotificationPushStore implements NotificationPushStore {
  constructor(private readonly sql: SqlExecutor) {}
  async claim(token: string) {
    await this.prune();
    const rows = await this.sql.query(`with candidates as (
       select notification_id,endpoint from notification_push_jobs where next_attempt_at<=clock_timestamp()
       and (lease_until is null or lease_until<=clock_timestamp()) order by next_attempt_at,notification_id,endpoint
       limit 100 for update skip locked
     ), claimed as (
       update notification_push_jobs j set lease_until=clock_timestamp()+interval '2 minutes',lease_token=$1::uuid
       from candidates c where j.notification_id=c.notification_id and j.endpoint=c.endpoint returning j.*
     ) select ${projection} from claimed j ${joins}`, [token]);
    return rows.map(fromRow);
  }
  async prune() {
    const rows=await this.sql.query(`delete from notification_push_jobs where (notification_id,endpoint) in (
      select j.notification_id,j.endpoint from notification_push_jobs j where not exists
       (select 1 from notification_inbox n join profiles p on p.user_id=n.recipient_id and p.account_status='ACTIVE'
        join push_subscriptions s on s.endpoint=j.endpoint and s.user_id=n.recipient_id and s.created_at=j.subscription_created_at
        where n.id=j.notification_id and ${relevant})
       order by j.next_attempt_at,j.notification_id,j.endpoint limit 1000 for update skip locked
    ) returning notification_id`);
    return rows.length;
  }
  async current(job: NotificationPushJob, token: string) {
    const rows = await this.sql.query(`select ${projection} from notification_push_jobs j ${joins}
      where j.notification_id=$1 and j.endpoint=$2 and j.lease_token=$3 and j.lease_until>clock_timestamp() and ${relevant}`, [job.notificationId,job.endpoint,token]);
    return rows[0] ? fromRow(rows[0]) : null;
  }
  async complete(job: NotificationPushJob, token: string) {
    await this.sql.query("delete from notification_push_jobs where notification_id=$1 and endpoint=$2 and lease_token=$3",[job.notificationId,job.endpoint,token]);
  }
  async retry(job: NotificationPushJob, token: string) {
    await this.sql.query(`update notification_push_jobs set attempts=attempts+1,
      next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,60*power(2,least(attempts,6)))),lease_until=null,lease_token=null
      where notification_id=$1 and endpoint=$2 and lease_token=$3`,[job.notificationId,job.endpoint,token]);
  }
  async expireSubscription(job: NotificationPushJob, token: string) {
    await this.sql.query(`delete from push_subscriptions s using notification_push_jobs j
      where j.notification_id=$1 and j.endpoint=$2 and j.lease_token=$3
      and s.endpoint=j.endpoint and s.created_at=j.subscription_created_at`,[job.notificationId,job.endpoint,token]);
    await this.complete(job,token);
  }
  async release(token: string) {
    await this.sql.query("update notification_push_jobs set lease_until=null,lease_token=null where lease_token=$1",[token]);
  }
  async stats() {
    const rows = await this.sql.query(`select count(*)::int as pending,min(n.created_at) as oldest_pending_at from notification_push_jobs j join notification_inbox n on n.id=j.notification_id`);
    return { pending:Number(rows[0]?.pending ?? 0),oldestPendingAt:rows[0]?.oldest_pending_at ? new Date(String(rows[0].oldest_pending_at)).toISOString() : null };
  }
}
function fromRow(row: SqlRow): NotificationPushJob {
  return { notificationId:String(row.notification_id),endpoint:String(row.endpoint),attempts:Number(row.attempts),expiresAt:new Date(String(row.expires_at)),
    kind:String(row.kind),title:String(row.title),body:String(row.body),url:String(row.destination),p256dh:String(row.p256dh),auth:String(row.auth) };
}

/** Request-scoped worker executor: pool acquisition is bounded to 5s by the shared pool. */
export function createNotificationPushStore(getPool:()=>Pool,now=Date.now):PostgresNotificationPushStore {
  const deadline=now()+45_000;
  return new PostgresNotificationPushStore({
    async query<TRow extends SqlRow = SqlRow>(statement:string,values?:readonly unknown[]) {
      // Reserve the pool's maximum connection wait before allowing a query to begin.
      const remaining=deadline-now()-5_000;
      if (remaining<=0) throw new Error("Notification dispatch database deadline exceeded");
      const config:QueryConfig & {query_timeout:number}={text:statement,values:values ? [...values] : undefined,query_timeout:Math.min(5_000,remaining)};
      const result=await getPool().query<TRow>(config);
      return result.rows;
    },
  });
}
