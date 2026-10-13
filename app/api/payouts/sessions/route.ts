import { payoutAction } from "@/app/payouts/payout-action";
import { getPayoutDependencies } from "@/app/payouts/payout-server-dependencies";

export const runtime = "nodejs";

/** UC1-08: the booker's sessions that can be, are being, or were paid out. */
export const GET = payoutAction(getPayoutDependencies, async (dependencies, userId) => ({
  items: (await dependencies.sessionPayouts.forBooker(userId)).map((item) => ({
    ...item,
    startAt: item.startAt.toISOString(),
  })),
}));
