import { randomUUID } from "node:crypto";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll,beforeAll,describe,expect,test } from "vitest";
import { PostgresTransactor } from "@/lib/database/postgres-transactor";
import { createPostgresExecutor } from "@/lib/database/postgres-executor";
import { PostgresNotificationWriter } from "@/lib/notifications/postgres-notification-writer";
import { PostgresNotificationInbox } from "@/lib/notifications/postgres-notification-inbox";
import { PostgresNotificationPushStore } from "@/lib/notifications/postgres-notification-push-store";
import { dispatchNotificationPush } from "@/lib/notifications/push-dispatcher";
import { createPostCommitNotificationPublisher } from "@/lib/notifications/postcommit-publisher";
import { sessionTestContext,sessionTestEnvironment,type SessionTestContext } from "../support/session-test-context";

describe("durable notification delivery",()=>{
  let context: SessionTestContext;
  let actor: Awaited<ReturnType<SessionTestContext["identity"]>>;
  const sessionId=randomUUID();
  beforeAll(async()=>{context=sessionTestContext();actor=await context.identity(false);});
  afterAll(async()=>{await context?.pool.end();});
  async function append(key:string,recipients=new Set<string>()) {
    await new PostgresTransactor(context.pool).transaction(sql=>new PostgresNotificationWriter(sql,key,recipients).append([
      {kind:"REPLACEMENT_REFUNDED",recipientId:actor.userId,sessionId,refundCents:100},
    ]));
    return recipients;
  }
  test("inbox and push jobs roll back together, deduplicate replay, and never requeue a successful device",async()=>{
    const endpoint=`https://push.test/${randomUUID()}`;
    await context.pool.query("insert into push_subscriptions(endpoint,user_id,p256dh,auth) values($1,$2,'key','auth')",[endpoint,actor.userId]);
    const rollbackKey=randomUUID();
    await expect(new PostgresTransactor(context.pool).transaction(async(sql)=>{
      await new PostgresNotificationWriter(sql,rollbackKey,new Set()).append([{kind:"REPLACEMENT_REFUNDED",recipientId:actor.userId,sessionId,refundCents:100}]);
      throw new Error("business write failed");
    })).rejects.toThrow("business write failed");
    expect((await context.pool.query("select count(*)::int as count from notification_inbox where recipient_id=$1",[actor.userId])).rows[0].count).toBe(0);
    expect((await context.pool.query("select count(*)::int as count from notification_push_jobs where endpoint=$1",[endpoint])).rows[0].count).toBe(0);
    const key=randomUUID();
    expect(await append(key)).toEqual(new Set([actor.userId]));
    expect(await append(key)).toEqual(new Set());
    const store=new PostgresNotificationPushStore(createPostgresExecutor(()=>context.pool));
    const report=await dispatchNotificationPush(store,async()=>"DELIVERED");
    expect(report.delivered).toBe(1);
    await append(key);
    expect((await context.pool.query("select count(*)::int as count from notification_push_jobs where endpoint=$1",[endpoint])).rows[0].count).toBe(0);
    await context.pool.query("delete from push_subscriptions where endpoint=$1",[endpoint]);
  });
  test("concurrent claims are exclusive, lease recovery is fenced, and subscription reassignment invalidates queued work",async()=>{
    const endpoint=`https://push.test/${randomUUID()}`;
    await context.pool.query("insert into push_subscriptions(endpoint,user_id,p256dh,auth) values($1,$2,'key','auth')",[endpoint,actor.userId]);
    await append(randomUUID());
    const store=new PostgresNotificationPushStore(createPostgresExecutor(()=>context.pool)),firstToken=randomUUID(),secondToken=randomUUID();
    const [first,second]=await Promise.all([store.claim(firstToken),store.claim(secondToken)]);
    expect(first.length+second.length).toBe(1);
    const oldToken=first.length ? firstToken : secondToken,job=(first[0] ?? second[0])!;
    await context.pool.query("update notification_push_jobs set lease_until=now()-interval '1 second' where endpoint=$1",[endpoint]);
    const newToken=randomUUID();
    expect(await store.claim(newToken)).toHaveLength(1);
    await store.complete(job,oldToken);
    expect(await store.current(job,newToken)).not.toBeNull();
    const other=await context.identity(false);
    await context.pool.query("update push_subscriptions set user_id=$2,created_at=clock_timestamp() where endpoint=$1",[endpoint,other.userId]);
    expect(await store.current(job,newToken)).toBeNull();
    await store.claim(randomUUID());
    expect((await context.pool.query("select count(*)::int as count from notification_push_jobs where endpoint=$1",[endpoint])).rows[0].count).toBe(0);
    await context.pool.query("delete from push_subscriptions where endpoint=$1",[endpoint]);
  });
  test("new actionable occurrences supersede old pending jobs without deleting inbox history",async()=>{
    const endpoint=`https://push.test/${randomUUID()}`,groupId=randomUUID();
    await context.pool.query("insert into push_subscriptions(endpoint,user_id,p256dh,auth) values($1,$2,'key','auth')",[endpoint,actor.userId]);
    const sql=createPostgresExecutor(()=>context.pool);
    for (const occurrenceKey of ["invited-first","invited-after-decline"]) {
      await new PostgresNotificationWriter(sql,occurrenceKey,new Set()).append([{kind:"GROUP_INVITATION",recipientId:actor.userId,groupId}]);
    }
    const pending=await context.pool.query("select n.source_key from notification_push_jobs j join notification_inbox n on n.id=j.notification_id where endpoint=$1",[endpoint]);
    expect(pending.rows).toHaveLength(1);
    expect(pending.rows[0].source_key).toContain("invited-after-decline");
    expect((await context.pool.query("select count(*)::int as count from notification_inbox where recipient_id=$1 and group_id=$2",[actor.userId,groupId])).rows[0].count).toBe(2);
    await context.pool.query("update notification_push_jobs set expires_at=now()-interval '1 second' where endpoint=$1",[endpoint]);
    await dispatchNotificationPush(new PostgresNotificationPushStore(sql),undefined);
    expect((await context.pool.query("select count(*)::int as count from notification_push_jobs where endpoint=$1",[endpoint])).rows[0].count).toBe(0);
    await context.pool.query("delete from push_subscriptions where endpoint=$1",[endpoint]);
  });
  test("HTTP persistence excludes expired history and cleanup leaves authoritative account records intact",async()=>{
    const user=(await context.identity(false)).userId,sql=createPostgresExecutor(()=>context.pool);
    await new PostgresNotificationWriter(sql,randomUUID(),new Set()).append([{kind:"WAITLIST_ENTERED",recipientId:user,sessionId}]);
    await context.pool.query("update notification_inbox set created_at=now()-interval '31 days' where recipient_id=$1",[user]);
    const page=await new PostgresNotificationInbox(sql).list(user,"all");
    expect(page.items).toEqual([]);
    expect(page.retentionCutoff).toBeInstanceOf(Date);
    await context.pool.query("select public.cleanup_notification_history(1000)");
    expect((await context.pool.query("select count(*)::int as count from notification_inbox where recipient_id=$1",[user])).rows[0].count).toBe(0);
    expect((await context.pool.query("select count(*)::int as count from wallets where user_id=$1",[user])).rows[0].count).toBe(1);
  });
});

describe("private notification Broadcast",()=>{
  let context:SessionTestContext;
  const clients:SupabaseClient[]=[];
  beforeAll(()=>{context=sessionTestContext();});
  afterAll(async()=>{for(const client of clients){await client.removeAllChannels();client.realtime.disconnect();}await context?.pool.end();});
  const settings=()=>sessionTestEnvironment();
  function client(){const s=settings(),value=createClient(s.supabaseUrl,s.anonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});clients.push(value);return value;}
  async function joined(channel:RealtimeChannel){return new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("Realtime subscription did not settle")),8_000);
    channel.subscribe((status)=>{if(status==="SUBSCRIBED"){clearTimeout(timer);resolve();}else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){clearTimeout(timer);reject(new Error(status));}});
  });}
  test("only the owner receives empty hints; same-name public channels stay isolated and clients cannot publish",async()=>{
    const actor=await context.identity(false),other=await context.identity(false),topic=`user:${actor.userId}:notifications`;
    const own=client(),stranger=client(),anonymous=client(),publicClient=client();
    await own.realtime.setAuth(actor.token);await stranger.realtime.setAuth(other.token);
    const messages:unknown[]=[],publicMessages:unknown[]=[];
    await joined(own.channel(topic,{config:{private:true}}).on("broadcast",{event:"notifications_changed"},message=>messages.push(message.payload)));
    await joined(publicClient.channel(topic,{config:{private:false}}).on("broadcast",{event:"notifications_changed"},message=>publicMessages.push(message.payload)));
    await expect(joined(stranger.channel(topic,{config:{private:true}}))).rejects.toThrow();
    await expect(joined(anonymous.channel(topic,{config:{private:true}}))).rejects.toThrow();
    const response=await fetch(`${settings().supabaseUrl}/realtime/v1/api/broadcast`,{method:"POST",headers:{apikey:settings().anonKey,Authorization:`Bearer ${actor.token}`,"Content-Type":"application/json"},
      body:JSON.stringify({messages:[{topic,event:"notifications_changed",payload:{forbidden:true},private:true}]})});
    expect(response.ok).toBe(false);
    await response.body?.cancel();
    const tasks:(()=>Promise<void>)[]=[];
    createPostCommitNotificationPublisher({url:settings().supabaseUrl,serviceRoleKey:settings().serviceKey},task=>tasks.push(task))([actor.userId]);
    await tasks[0]!();
    await expect.poll(()=>messages.length,{timeout:3_000}).toBe(1);
    expect(messages[0]).toEqual({});
    expect(publicMessages).toEqual([]);
    const grants=await context.pool.query("select has_table_privilege('authenticated','public.notification_inbox','SELECT') as readable");
    expect(grants.rows[0].readable).toBe(false);
  });
});
