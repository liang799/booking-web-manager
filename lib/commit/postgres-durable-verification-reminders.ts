import type { SqlTransactor } from "@/lib/money/sql";
import type { VerificationReminderQuery } from "@/use-cases/sessions/scheduling-ports";
import { PostgresNotificationWriter } from "@/lib/notifications/postgres-notification-writer";
import { withNotificationPublication } from "@/lib/notifications/transaction-publication";
import { PostgresVerificationReminderQuery } from "./postgres-verification-reminder-query";

/** A reminder can never be marked sent without its canonical inbox message. */
export class PostgresDurableVerificationReminders implements VerificationReminderQuery {
  constructor(private readonly transactions: SqlTransactor, private readonly publish: (recipients: readonly string[]) => void = () => {}) {}

  enqueueVerificationReminders(now: Date, limit: number) {
    return withNotificationPublication((recipients) => this.transactions.transaction(async (sql) => {
      const due = await new PostgresVerificationReminderQuery(sql).claimVerificationReminders(now, limit);
      const notifications = new PostgresNotificationWriter(sql, "verification-reminder", recipients);
      await notifications.append(due.map((reminder) => ({
        kind: "VERIFICATION_REMINDER", recipientId: reminder.bookerId, sessionId: reminder.sessionId,
        occurrenceKey: reminder.sessionId,
      })));
      return due;
    }), this.publish);
  }
}
