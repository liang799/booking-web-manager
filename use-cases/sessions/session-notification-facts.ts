import type { FinancialInstruction, Session, UUID } from "@/domain";
import type { NotificationIntent } from "../notifications/notification-intents";

export function sessionNotificationFacts(session: Session) {
  return { sessionId: session.sessionId, subjectName: session.booking.venueName, startAt: session.booking.startAt };
}

/** Every receipt comes from an actual ledger refund, never from a recomputed quote. */
export function replacementRefundNotifications(session: Session, instructions: readonly FinancialInstruction[], occurrenceKey: string): NotificationIntent[] {
  return instructions.filter((entry) => entry.kind === "REFUND").map((entry) => ({
    ...sessionNotificationFacts(session), kind: "REPLACEMENT_REFUNDED", occurrenceKey,
    recipientId: session.participantList.requireParticipation(entry.participationId).userId,
    refundCents: entry.amount.toCents(),
  }));
}

/** Read the live audience before cancellation changes participation states. */
export function cancellationRecipients(session: Session): Set<UUID> {
  const recipients = new Set<UUID>();
  for (const participation of session.participantList.participations) {
    if (participation.status === "COMMITTED" || participation.status === "WAITLISTED" || participation.hold?.state === "AWAITING_REPLACEMENT" || participation.hold?.state === "FORFEITURE_DUE") recipients.add(participation.userId);
    const invitee = participation.replacementInviteeId;
    if (invitee && session.participantList.personalReplacementForInvitee(invitee) !== undefined) recipients.add(invitee);
  }
  recipients.delete(session.bookerId);
  return recipients;
}
