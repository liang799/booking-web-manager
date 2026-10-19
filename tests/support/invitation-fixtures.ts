import { randomUUID } from "node:crypto";
import { PLATFORM_HOLDING_ACCOUNT_ID } from "@/lib/money/constants";
import type { SessionTestContext } from "./session-test-context";

export type InvitationIdentity = Awaited<ReturnType<SessionTestContext["identity"]>>;

/** A private invitation on the guarded disposable stack; no provider calls or payments. */
export async function invitationFixture(context: SessionTestContext) {
  const booker = await context.identity();
  const sessionId = randomUUID();
  const roomToken = randomUUID();
  const venueName = `Invitation-${randomUUID().slice(0, 8)}`;
  await context.pool.query(
    `insert into sessions(session_id,booker_id,venue_name,region,sport,start_at,end_at,total_cost_cents,
      total_slots,minimum_headcount,booking_share_cents,visibility,room_token,holding_account_id)
      values ($1,$2,$3,'West','Badminton','2045-06-17T10:00:00Z','2045-06-17T12:00:00Z',
      1000,2,2,500,'PRIVATE',$4,$5)`,
    [sessionId, booker.userId, venueName, roomToken, PLATFORM_HOLDING_ACCOUNT_ID],
  );
  return { booker, sessionId, roomToken, venueName, invitationPath: `/sessions/${sessionId}/join?token=${roomToken}` };
}

/** Fund a fixture wallet through the real ledger projection before asking the join API to lock it. */
export async function fundInvitationWallet(context: SessionTestContext, identity: InvitationIdentity, amountCents = 2000) {
  await context.pool.query(
    "insert into ledger_entries(kind,amount_cents,occurred_at,idempotency_key,external_reference,wallet_id) values ('TOP_UP',$4,now(),$1,$2,$3)",
    [randomUUID(), randomUUID(), identity.walletId, amountCents],
  );
}

/** Read all persisted effects of this player's admission, including the ledger's actual lock. */
export async function invitationAdmission(context: SessionTestContext, sessionId: string, identity: InvitationIdentity) {
  const participation = await context.pool.query(
    "select participation_id,status from participations where session_id=$1 and user_id=$2",
    [sessionId, identity.userId],
  );
  const holds = await context.pool.query(
    `select h.amount_cents,h.state from fund_holds h join participations p using(participation_id)
     where p.session_id=$1 and p.user_id=$2`,
    [sessionId, identity.userId],
  );
  const locks = await context.pool.query(
    "select amount_cents from ledger_entries where session_id=$1 and wallet_id=$2 and kind='LOCK'",
    [sessionId, identity.walletId],
  );
  return { participation: participation.rows, holds: holds.rows, locks: locks.rows };
}
