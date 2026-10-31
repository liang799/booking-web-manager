import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { PostgresInvitedSessionReader } from "@/lib/sessions/postgres-invited-session-reader";
import { PostgresSessionManagementTransaction } from "@/lib/sessions/postgres-session-management-transaction";
import { GetInvitedSession } from "@/use-cases/sessions/GetInvitedSession";
import { GetSessionInvitation } from "@/use-cases/sessions/GetSessionInvitation";
import { addCancellationParticipant, cancellationSql } from "../support/cancellation-fixtures";
import { invitationFixture } from "../support/invitation-fixtures";
import { sessionTestContext, type SessionTestContext } from "../support/session-test-context";

const now = new Date("2040-01-01T00:00:00Z");
const clock = { now: () => now };

describe("private session invitation persistence", () => {
  let context: SessionTestContext;
  beforeAll(() => { context = sessionTestContext(); });
  afterAll(async () => { await context?.pool.end(); });

  function preview(at = now) {
    return new GetInvitedSession({ reader: new PostgresInvitedSessionReader(() => context.pool), clock: { now: () => at } });
  }

  test("matches the exact opaque token and projects only safe session facts without hydrating the owner", async () => {
    const fixture = await invitationFixture(context);
    const token = `Opaque +/Token?=#%é-${randomUUID()}`;
    await context.pool.query("update sessions set room_token=$2 where session_id=$1", [fixture.sessionId, token]);
    // Invitation previews need no account, payout, wallet or roster hydration.
    await context.pool.query("update profiles set preferred_sports='{\"\"}' where user_id=$1", [fixture.booker.userId]);
    const summary = await preview().byToken(fixture.sessionId, token);
    expect(summary).toEqual({
      sessionId: fixture.sessionId, venueName: fixture.venueName, sport: "Badminton", region: "West",
      startAt: new Date("2045-06-17T10:00:00Z"), endAt: new Date("2045-06-17T12:00:00Z"),
      totalSlots: 3, bookingShareCents: 500,
    });
    for (const wrong of [token.toLowerCase(), ` ${token}`, `${token} `, `${token}' OR true --`]) {
      expect(await preview().byToken(fixture.sessionId, wrong)).toBeNull();
    }
    expect(await preview().byToken(randomUUID(), token)).toBeNull();
    expect((await context.pool.query("select count(*)::int as count from participations where session_id=$1", [fixture.sessionId])).rows).toEqual([{ count: 0 }]);
    expect((await context.pool.query("select count(*)::int as count from ledger_entries where session_id=$1", [fixture.sessionId])).rows).toEqual([{ count: 0 }]);
  });

  test("a valid token stops revealing the session exactly at its start or after any closure", async () => {
    const fixture = await invitationFixture(context);
    expect(await preview(new Date("2045-06-17T09:59:59.999Z")).byToken(fixture.sessionId, fixture.roomToken)).not.toBeNull();
    expect(await preview(new Date("2045-06-17T10:00:00Z")).byToken(fixture.sessionId, fixture.roomToken)).toBeNull();
    expect(await preview(new Date("2045-06-17T10:00:00.001Z")).byToken(fixture.sessionId, fixture.roomToken)).toBeNull();
    for (const status of ["CANCELLED", "AWAITING_PAYOUT", "PAYOUT_PENDING", "SETTLED"]) {
      await context.pool.query("update sessions set status=$2 where session_id=$1", [fixture.sessionId, status]);
      expect(await preview().byToken(fixture.sessionId, fixture.roomToken)).toBeNull();
    }
  });

  test("reading a full private session invitation preserves its token, visibility, roster and held funds", async () => {
    const fixture = await invitationFixture(context);
    for (let index = 0; index < 2; index++) {
      await addCancellationParticipant(cancellationSql(context), fixture.sessionId, await context.identity(false));
    }
    async function snapshot() {
      return {
        session: (await context.pool.query("select visibility,room_token,status from sessions where session_id=$1", [fixture.sessionId])).rows,
        participants: (await context.pool.query("select * from participations where session_id=$1 order by participation_id", [fixture.sessionId])).rows,
        holds: (await context.pool.query("select h.* from fund_holds h join participations p using(participation_id) where p.session_id=$1 order by h.hold_id", [fixture.sessionId])).rows,
        ledger: (await context.pool.query("select * from ledger_entries where session_id=$1 order by entry_id", [fixture.sessionId])).rows,
      };
    }
    const before = await snapshot();
    const invitations = new GetSessionInvitation({ transaction: new PostgresSessionManagementTransaction(() => context.pool, clock), clock });
    expect(await invitations.forBooker(fixture.booker.userId, fixture.sessionId)).toEqual({ sessionId: fixture.sessionId, roomToken: fixture.roomToken });
    expect(await invitations.forBooker(fixture.booker.userId, fixture.sessionId)).toEqual({ sessionId: fixture.sessionId, roomToken: fixture.roomToken });
    expect(await preview().byToken(fixture.sessionId, fixture.roomToken)).toMatchObject({ sessionId: fixture.sessionId, totalSlots: 3, bookingShareCents: 500 });
    expect(await snapshot()).toEqual(before);
  });
  test("tokenless group previews check current membership and active account without exposing the room token", async () => {
    const fixture = await invitationFixture(context);
    const member = await context.identity(false);
    const stranger = await context.identity(false);
    const groupId = randomUUID();
    await context.pool.query(
      "insert into regular_groups(group_id,owner_id,name,invitation_token,invitation_active,status) values($1,$2,'Preview group',$3,true,'ACTIVE')",
      [groupId,fixture.booker.userId,randomUUID()],
    );
    await context.pool.query("insert into group_memberships(group_id,user_id,joined_at) values($1,$2,now()),($1,$3,now())", [groupId,fixture.booker.userId,member.userId]);
    await context.pool.query("update sessions set invited_group_id=$2 where session_id=$1", [fixture.sessionId,groupId]);
    const result = await preview().forGroupMember(fixture.sessionId,member.userId);
    expect(result).toMatchObject({sessionId:fixture.sessionId,bookingShareCents:500});
    expect(result).not.toHaveProperty("roomToken");
    expect(await preview().forGroupMember(fixture.sessionId,stranger.userId)).toBeNull();
    await context.pool.query("delete from group_memberships where group_id=$1 and user_id=$2", [groupId,member.userId]);
    expect(await preview().forGroupMember(fixture.sessionId,member.userId)).toBeNull();
    await context.pool.query("insert into group_memberships(group_id,user_id,joined_at) values($1,$2,now())", [groupId,member.userId]);
    await context.pool.query("update profiles set account_status='INACTIVE' where user_id=$1", [member.userId]);
    expect(await preview().forGroupMember(fixture.sessionId,member.userId)).toBeNull();
    expect(await preview(new Date("2045-06-17T10:00:00Z")).forGroupMember(fixture.sessionId,fixture.booker.userId)).toBeNull();
  });

});
