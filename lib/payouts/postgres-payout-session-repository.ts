import type { FundHold, Participation, PayoutBatch, Session, UUID } from "@/domain";
import type { SqlExecutor } from "@/lib/money/sql";
import type { Repository } from "@/use-cases/shared/contracts";
import { SessionPersistenceError } from "@/lib/sessions/postgres-row-values";
import { PostgresSessionManagementRepository } from "@/lib/sessions/postgres-session-management-repository";

/**
 * Session persistence for UC1-08 payouts: preparing, completing and failing a
 * settlement. `get` locks the session row (`FOR UPDATE`) and hydrates the
 * complete aggregate through the shared session reader. `save` writes the
 * session's status, pending settlement and payout history, plus the
 * participations and holds that changed since the load (settlement expires
 * replacements and releases or forfeits holds). It never inserts participants.
 */
export class PostgresPayoutSessionRepository implements Repository<Session> {
  readonly #loaded = new Map<UUID, ReadonlyMap<UUID, Participation>>();

  /** Uses the caller's SQL executor so reads and writes share its transaction. */
  constructor(private readonly sql: SqlExecutor) {}

  async get(sessionId: UUID): Promise<Session | null> {
    const session = await new PostgresSessionManagementRepository(this.sql).get(sessionId);
    if (session !== null) this.#remember(session);
    return session;
  }

  async save(session: Session): Promise<void> {
    const loaded = this.#loaded.get(session.sessionId);
    if (loaded === undefined)
      throw new SessionPersistenceError("A session must be loaded in this transaction before it is saved");

    const current = session.participantList.participations;
    if (current.length !== loaded.size || current.some((p) => !loaded.has(p.participationId)))
      throw new SessionPersistenceError("Payout workflows cannot add or remove participants");

    for (const after of current) {
      const before = loaded.get(after.participationId);
      if (before === undefined || after === before) continue;
      await this.#updateParticipation(session.sessionId, after);
      if (after.hold !== before.hold) {
        if (after.hold === undefined || before.hold === undefined)
          throw new SessionPersistenceError("Payout workflows cannot create or remove fund holds");
        await this.#updateHold(after.hold);
      }
    }

    const rows = await this.sql.query(
      `update sessions
          set status = $2,
              pending_settlement = $3::jsonb,
              payout_attempt_ids = $4::uuid[],
              payout_idempotency_keys = $5::text[]
        where session_id = $1
      returning session_id`,
      [
        session.sessionId,
        session.status,
        storedBatch(session.pendingSettlement),
        [...session.payoutAttemptIds],
        [...session.payoutIdempotencyKeys],
      ],
    );
    if (rows.length !== 1) throw new SessionPersistenceError("Session update did not find the session");
    this.#remember(session);
  }

  #remember(session: Session): void {
    this.#loaded.set(
      session.sessionId,
      new Map(session.participantList.participations.map((p) => [p.participationId, p])),
    );
  }

  async #updateParticipation(sessionId: UUID, p: Participation): Promise<void> {
    const rows = await this.sql.query(
      `update participations set status = $4, attendance = $5,
         waitlisted_at = $6, committed_at = $7, withdrawn_at = $8,
         replacement_mode = $9, replacement_invitee_id = $10, verified_at = $11,
         verification_method = $12, replaces_participation_id = $13,
         queue_sequence = $14
       where session_id = $1 and participation_id = $2 and user_id = $3
       returning participation_id`,
      [
        sessionId,
        p.participationId,
        p.userId,
        p.status,
        p.attendance,
        p.waitlistedAt ?? null,
        p.committedAt ?? null,
        p.withdrawnAt ?? null,
        p.replacementMode ?? null,
        p.replacementInviteeId ?? null,
        p.verifiedAt ?? null,
        p.verificationMethod ?? null,
        p.replacesParticipationId ?? null,
        p.queueSequence ?? null,
      ],
    );
    if (rows.length !== 1) throw new SessionPersistenceError("Participation update did not find its row");
  }

  async #updateHold(hold: FundHold): Promise<void> {
    const rows = await this.sql.query(
      `update fund_holds set state = $3, settled_at = $4, payout_id = $5
       where hold_id = $1 and participation_id = $2 returning hold_id`,
      [hold.holdId, hold.participationId, hold.state, hold.settledAt ?? null, hold.payoutId ?? null],
    );
    if (rows.length !== 1) throw new SessionPersistenceError("Fund hold update did not find its row");
  }
}

/** The JSON shape the shared session reader validates when hydrating `pending_settlement`. */
function storedBatch(batch: PayoutBatch | undefined): string | null {
  if (batch === undefined) return null;
  return JSON.stringify({
    payoutId: batch.payoutId,
    sessionId: batch.sessionId,
    idempotencyKey: batch.idempotencyKey,
    requestedAt: batch.requestedAt.toISOString(),
    destination: { ...batch.destination },
    lines: batch.lines.map((line) => ({
      holdId: line.holdId,
      participationId: line.participationId,
      holdingAccountId: line.holdingAccountId,
      walletId: line.walletId,
      amountCents: line.amount.toCents(),
      kind: line.kind,
    })),
  });
}
