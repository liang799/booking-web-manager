import type { CommitmentNotification, CommitmentNotifier } from "@/use-cases/sessions/commitment-notifications";

/** Both channels are attempted after commit. Inbox failures must reach the reminder retry boundary. */
export class InboxNotifier implements CommitmentNotifier {
  constructor(
    private readonly inbox: { save(notification: CommitmentNotification): Promise<void> },
    private readonly push?: CommitmentNotifier,
  ) {}

  async notify(notifications: readonly CommitmentNotification[]): Promise<void> {
    const [saved] = await Promise.all([
      Promise.allSettled(notifications.map((notification) => this.inbox.save(notification))),
      this.push?.notify(notifications).catch(() => {}),
    ]);
    const failure = saved.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
}
