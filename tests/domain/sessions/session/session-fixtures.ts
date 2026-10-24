import {
  Booking,
  FundHold,
  Money,
  Participation,
  Session,
  type BookerSessionCreation,
  type ParticipationDetails,
  type SessionDetails,
} from "@/domain";
import { readyBookerUser } from "../../accounts/user-fixtures";

export { createTestUser } from "../../accounts/user-fixtures";

const millisecondsPerHour = 3_600_000;
export const sessionStartsAt = new Date("2026-10-10T10:00:00Z");
export const sessionEndsAt = new Date(
  sessionStartsAt.getTime() + 2 * millisecondsPerHour,
);
export const hoursBeforeSessionStart = (hours: number) =>
  new Date(sessionStartsAt.getTime() - hours * millisecondsPerHour);
export const hoursBeforeSessionEnd = (hours: number) =>
  new Date(sessionEndsAt.getTime() - hours * millisecondsPerHour);
export const hoursAfterSessionEnd = (hours: number) =>
  new Date(sessionEndsAt.getTime() + hours * millisecondsPerHour);
export const destination = {
  payoutAccountId: "pa",
  userId: "booker",
  providerAccountReference: "provider",
  bankAccountReference: "bank",
};

export function creationDetails(totalSlots = 2): BookerSessionCreation {
  return {
    sessionId: "s",
    booking: new Booking({
      venueName: "Court",
      region: "North",
      sport: "Badminton",
      startAt: sessionStartsAt,
      endAt: sessionEndsAt,
      totalCost: Money.fromCents(1000),
    }),
    totalSlots,
    minimumHeadcount: 2,
    holdingAccountId: "platform",
    roomToken: "room",
    visibility: "PUBLIC",
    now: hoursBeforeSessionStart(48),
  };
}

export function readyBooker(userId = "booker") {
  return readyBookerUser(userId).asBooker();
}

interface TestSessionOptions {
  readonly totalSlots?: number;
  readonly bookingShare?: Money;
  readonly status?: SessionDetails["status"];
  readonly visibility?: SessionDetails["visibility"];
  readonly invitedGroupId?: SessionDetails["invitedGroupId"];
  readonly minimumReliability?: SessionDetails["minimumReliability"];
  readonly committedUserIds?: readonly string[];
  readonly waitlistedUserIds?: readonly string[];
  readonly attendanceByUserId?: Readonly<Record<string, "ATTENDED" | "ABSENT">>;
  readonly participationOverrides?: Readonly<Record<string, Participation>>;
}

/** Constructs starting state without running the commands exercised by tests. */
export function createTestSession({
  totalSlots = 2,
  bookingShare,
  status = "OPEN",
  visibility = "PUBLIC",
  invitedGroupId,
  minimumReliability,
  committedUserIds = [],
  waitlistedUserIds = [],
  attendanceByUserId = {},
  participationOverrides = {},
}: TestSessionOptions = {}): Session {
  const details = sessionDetails({
    totalSlots,
    bookingShare,
    status,
    visibility,
    invitedGroupId,
    minimumReliability,
  });
  const terms = {
    holdingAccountId: details.holdingAccountId,
    bookingShare:
      bookingShare ?? details.booking.totalCost.divideFloor(totalSlots),
  };
  const attendanceMarks = new Map(Object.entries(attendanceByUserId));
  const rosterOverrides = new Map(Object.entries(participationOverrides));
  const rosterUserIds = new Set([...committedUserIds, ...waitlistedUserIds]);
  for (const [userId, participation] of rosterOverrides) {
    if (!rosterUserIds.has(userId) || participation.userId !== userId) {
      throw new Error(
        `Participation override must match a roster user: ${userId}`,
      );
    }
  }
  return new Session({
    ...details,
    participations: [
      ...committedUserIds.map((userId) => {
        const attendance = attendanceMarks.get(userId);
        return attendance === undefined
          ? committedParticipation(terms, userId)
          : verifiedParticipation(userId, attendance, sessionEndsAt, terms);
      }),
      ...waitlistedUserIds.map((userId, index) =>
        Participation.createWaitlisted({
          participationId: `p-${userId}`,
          userId,
          waitlistedAt: hoursBeforeSessionStart(48),
          queueSequence: index + 1,
        }),
      ),
    ].map(
      (participation) =>
        rosterOverrides.get(participation.userId) ?? participation,
    ),
    nextQueueSequence: waitlistedUserIds.length + 1,
  });
}

interface WithdrawnParticipationOptions {
  readonly withdrawnAt: Date;
  readonly replacementMode?: ParticipationDetails["replacementMode"];
  readonly replacementInviteeId?: string;
  readonly holdState: "REFUNDED" | "AWAITING_REPLACEMENT" | "FORFEITURE_DUE";
  readonly settledAt?: Date;
  readonly committedAt?: Date;
  readonly replacesParticipationId?: string;
}

/** The caller states the financial outcome; this fixture does not apply withdrawal rules. */
export function withdrawnParticipation(
  userId: string,
  {
    withdrawnAt,
    replacementMode,
    replacementInviteeId,
    holdState,
    settledAt,
    committedAt = hoursBeforeSessionStart(48),
    replacesParticipationId,
  }: WithdrawnParticipationOptions,
  terms: Pick<Session, "holdingAccountId" | "bookingShare"> = {
    holdingAccountId: "platform",
    bookingShare: Money.fromCents(500),
  },
): Participation {
  return new Participation({
    participationId: `p-${userId}`,
    userId,
    status: "WITHDRAWN",
    attendance: "UNVERIFIED",
    committedAt,
    withdrawnAt,
    replacementMode,
    replacementInviteeId,
    replacesParticipationId,
    hold: new FundHold({
      holdId: `h-${userId}`,
      participationId: `p-${userId}`,
      holdingAccountId: terms.holdingAccountId,
      walletId: `w-${userId}`,
      amount: terms.bookingShare,
      state: holdState,
      createdAt: committedAt,
      settledAt:
        settledAt ?? (holdState === "REFUNDED" ? withdrawnAt : undefined),
    }),
  });
}

interface ClosedParticipationOptions {
  readonly settledAt: Date;
  readonly committedAt?: Date;
  readonly withdrawnAt?: Date;
  readonly replacesParticipationId?: string;
}

function closedParticipation(
  userId: string,
  status: "REMOVED" | "CANCELLED",
  {
    settledAt,
    committedAt = hoursBeforeSessionStart(48),
    withdrawnAt,
    replacesParticipationId,
  }: ClosedParticipationOptions,
  terms: Pick<Session, "holdingAccountId" | "bookingShare">,
): Participation {
  return new Participation({
    participationId: `p-${userId}`,
    userId,
    status,
    attendance: "UNVERIFIED",
    committedAt,
    withdrawnAt,
    replacesParticipationId,
    hold: new FundHold({
      holdId: `h-${userId}`,
      participationId: `p-${userId}`,
      holdingAccountId: terms.holdingAccountId,
      walletId: `w-${userId}`,
      amount: terms.bookingShare,
      state: "REFUNDED",
      createdAt: committedAt,
      settledAt,
    }),
  });
}

export function removedParticipation(
  userId: string,
  options: ClosedParticipationOptions,
  terms: Pick<Session, "holdingAccountId" | "bookingShare"> = {
    holdingAccountId: "platform",
    bookingShare: Money.fromCents(500),
  },
): Participation {
  return closedParticipation(userId, "REMOVED", options, terms);
}

export function cancelledParticipation(
  userId: string,
  options: ClosedParticipationOptions,
  terms: Pick<Session, "holdingAccountId" | "bookingShare"> = {
    holdingAccountId: "platform",
    bookingShare: Money.fromCents(500),
  },
): Participation {
  return closedParticipation(userId, "CANCELLED", options, terms);
}

export function leftWaitlistedParticipation(
  userId: string,
  queueSequence: number,
  waitlistedAt = hoursBeforeSessionStart(48),
): Participation {
  return new Participation({
    participationId: `p-${userId}`,
    userId,
    status: "LEFT_WAITLIST",
    attendance: "UNVERIFIED",
    waitlistedAt,
    queueSequence,
  });
}

export function committedParticipation(
  session: Pick<Session, "holdingAccountId" | "bookingShare">,
  userId: string,
  now = hoursBeforeSessionStart(48),
) {
  return Participation.createCommitted({
    participationId: `p-${userId}`,
    userId,
    committedAt: now,
    hold: FundHold.create({
      holdId: `h-${userId}`,
      participationId: `p-${userId}`,
      holdingAccountId: session.holdingAccountId,
      walletId: `w-${userId}`,
      amount: session.bookingShare,
      createdAt: now,
    }),
  });
}

export function verifiedParticipation(
  userId: string,
  attendance: "ATTENDED" | "ABSENT",
  verifiedAt = sessionEndsAt,
  terms: Pick<Session, "holdingAccountId" | "bookingShare"> = {
    holdingAccountId: "platform",
    bookingShare: Money.fromCents(500),
  },
): Participation {
  return new Participation({
    participationId: `p-${userId}`,
    userId,
    status: "COMMITTED",
    attendance,
    committedAt: hoursBeforeSessionStart(48),
    verifiedAt,
    verificationMethod: "BOOKER",
    hold: new FundHold({
      holdId: `h-${userId}`,
      participationId: `p-${userId}`,
      holdingAccountId: terms.holdingAccountId,
      walletId: `w-${userId}`,
      amount: terms.bookingShare,
      state: "HELD",
      createdAt: hoursBeforeSessionStart(48),
    }),
  });
}

/** A fixed release-only payout state; tests declare other outcomes explicitly. */
export function pendingPayoutDetails(
  userIds: readonly string[] = ["alice"],
  {
    bookingShare,
    payoutId = "out",
    idempotencyKey = "key",
  }: {
    readonly bookingShare?: Money;
    readonly payoutId?: string;
    readonly idempotencyKey?: string;
  } = {},
): SessionDetails {
  const share = bookingShare ?? Money.fromCents(500);
  return sessionDetails({
    ...(bookingShare === undefined ? {} : { bookingShare }),
    status: "PAYOUT_PENDING",
    participations: userIds.map((userId) =>
      verifiedParticipation(userId, "ATTENDED", sessionEndsAt, {
        holdingAccountId: "platform",
        bookingShare: share,
      }),
    ),
    pendingSettlement: {
      payoutId,
      sessionId: "s",
      idempotencyKey,
      requestedAt: new Date(sessionEndsAt),
      destination: { ...destination },
      lines: userIds.map((userId) => ({
        holdId: `h-${userId}`,
        participationId: `p-${userId}`,
        holdingAccountId: "platform",
        walletId: `w-${userId}`,
        amount: share,
        kind: "RELEASE",
      })),
    },
    payoutAttemptIds: [payoutId],
    payoutIdempotencyKeys: [idempotencyKey],
  });
}

export function sessionDetails(
  overrides: Partial<SessionDetails> = {},
): SessionDetails {
  return {
    sessionId: "s",
    bookerId: "booker",
    booking: creationDetails().booking,
    totalSlots: 2,
    minimumHeadcount: 2,
    holdingAccountId: "platform",
    roomToken: "room",
    visibility: "PUBLIC",
    status: "OPEN",
    participations: [],
    nextQueueSequence: 1,
    payoutAttemptIds: [],
    payoutIdempotencyKeys: [],
    ...overrides,
  };
}

// Capture observable command effects as values, including nested private-field objects.
export function sessionState(s: Session) {
  const batch = s.pendingSettlement;
  return {
    status: s.status,
    visibility: s.visibility,
    invitedGroupId: s.invitedGroupId,
    nextQueueSequence: s.participantList.nextQueueSequence,
    payoutAttemptIds: s.payoutAttemptIds,
    payoutIdempotencyKeys: s.payoutIdempotencyKeys,
    pendingSettlement: batch && {
      ...batch,
      lines: batch.lines.map((line) => ({
        ...line,
        amount: line.amount.toCents(),
      })),
    },
    participations: s.participantList.participations.map((p) => ({
      participationId: p.participationId,
      userId: p.userId,
      status: p.status,
      attendance: p.attendance,
      queueSequence: p.queueSequence,
      waitlistedAt: p.waitlistedAt,
      committedAt: p.committedAt,
      withdrawnAt: p.withdrawnAt,
      replacementMode: p.replacementMode,
      replacementInviteeId: p.replacementInviteeId,
      replacesParticipationId: p.replacesParticipationId,
      verifiedAt: p.verifiedAt,
      verificationMethod: p.verificationMethod,
      hold: p.hold && {
        holdId: p.hold.holdId,
        participationId: p.hold.participationId,
        holdingAccountId: p.hold.holdingAccountId,
        walletId: p.hold.walletId,
        amount: p.hold.amount.toCents(),
        state: p.hold.state,
        payoutId: p.hold.payoutId,
        createdAt: p.hold.createdAt,
        settledAt: p.hold.settledAt,
      },
    })),
  };
}
