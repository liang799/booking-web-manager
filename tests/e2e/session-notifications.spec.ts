import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { RegularGroup } from "@/domain";
import { supabaseGroupStore } from "@/lib/supabase/group-store";
import { createPostCommitNotificationPublisher } from "@/lib/notifications/postcommit-publisher";
import { sessionTestContext, sessionTestEnvironment } from "../support/session-test-context";

test("a committed group invitation reaches the live private inbox and keeps read state only in this browser", async ({ page }, testInfo) => {
  const context = sessionTestContext();
  try {
    const owner = await context.identity(false), recipient = await context.identity(false);
    const settings = sessionTestEnvironment(), tasks: (() => Promise<void>)[] = [];
    const publish = createPostCommitNotificationPublisher({url: settings.supabaseUrl, serviceRoleKey: settings.serviceKey}, task => tasks.push(task));
    const { groups } = supabaseGroupStore(publish);
    const groupName = `Live group ${randomUUID().slice(0, 8)}`;
    const group = RegularGroup.create({groupId: randomUUID(), ownerId: owner.userId, name: groupName, invitationToken: randomUUID(), now: new Date()});
    await groups.save(group);
    let joined = false, readMutations = 0;
    page.on("request", request => { if (request.url().includes("/api/notifications") && request.method() === "PATCH") readMutations++; });
    page.on("websocket", socket => socket.on("framereceived", frame => {
      if (typeof frame.payload !== "string") return;
      try {
        const decoded = JSON.parse(frame.payload);
        const message = Array.isArray(decoded) ? {topic:decoded[2],event:decoded[3],payload:decoded[4]} : decoded;
        if (message.topic === `realtime:user:${recipient.userId}:notifications` && message.event === "phx_reply" && message.payload?.status === "ok") joined = true;
      } catch { /* Ignore other transport frames. */ }
    }));
    await page.goto("/login?next=%2Fnotifications");
    await page.getByLabel("Email", {exact:true}).fill(recipient.email);
    await page.getByLabel("Password", {exact:true}).fill(recipient.password);
    await page.getByRole("button", {name:"Log in", exact:true}).click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect.poll(() => joined).toBe(true);
    await expect(page.getByRole("heading", {name:"Notifications", exact:true})).toBeVisible();
    group.invite({actorId: owner.userId, inviteeId: recipient.userId, now: new Date()});
    await groups.save(group, [{kind:"GROUP_INVITATION",recipientId:recipient.userId,groupId:group.groupId,subjectName:group.name}]);
    await Promise.all(tasks.splice(0).map(task => task()));
    const notice = page.getByRole("link").filter({hasText:groupName});
    await expect(notice).toBeVisible({timeout:3000});
    await page.screenshot({path:testInfo.outputPath("live-inbox.png"),fullPage:true});
    const rows = await context.pool.query("select id from notification_inbox where recipient_id=$1 and group_id=$2",[recipient.userId,group.groupId]);
    expect(rows.rows).toHaveLength(1);
    await notice.click();
    await expect(page).toHaveURL(new RegExp(`/groups\\?invitation=${group.groupId}`));
    await expect(page.getByRole("button", {name:`Join ${groupName}`, exact:true})).toBeVisible();
    expect((await context.pool.query("select count(*)::int as count from group_memberships where group_id=$1 and user_id=$2",[group.groupId,recipient.userId])).rows[0].count).toBe(0);
    expect(await page.evaluate(id => Object.keys(localStorage).filter(key => key.includes("notifications")).some(key => localStorage.getItem(key)?.includes(id)),rows.rows[0].id)).toBe(true);
    expect(readMutations).toBe(0);
  } finally { await context.pool.end(); }
});
