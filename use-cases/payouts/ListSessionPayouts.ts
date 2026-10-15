import type { UUID } from "@/domain";

export interface SessionPayoutItem {
  readonly sessionId: UUID;
  readonly venueName: string;
  readonly sport: string;
  readonly startAt: Date;
  /**
   * AWAITING_PAYOUT: attendance is verified and the booker can withdraw.
   * PAYOUT_PENDING: a withdrawal is in progress; withdrawing again resumes it.
   * SETTLED: paid out.
   */
  readonly status: "AWAITING_PAYOUT" | "PAYOUT_PENDING" | "SETTLED";
  /** What the booker will receive or received. Estimated until the payout is prepared. */
  readonly amountCents: number;
}

/** Read-only view of a booker's sessions after attendance is verified. */
export interface SessionPayoutReader {
  listForBooker(bookerId: UUID): Promise<readonly SessionPayoutItem[]>;
}

/** UC1-08: what the booker can withdraw, and what they already have. */
export class ListSessionPayouts {
  constructor(private readonly reader: SessionPayoutReader) {}

  forBooker(bookerId: UUID): Promise<readonly SessionPayoutItem[]> {
    return this.reader.listForBooker(bookerId);
  }
}
