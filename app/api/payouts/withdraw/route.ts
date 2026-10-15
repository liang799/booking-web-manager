import { payoutAction } from "@/app/payouts/payout-action";
import { getPayoutDependencies } from "@/app/payouts/payout-server-dependencies";
import { parseWithdrawInput, readJsonBody } from "@/app/payouts/withdraw-input";

export const runtime = "nodejs";

/**
 * UC1-08: withdraw a verified session's settlement to the booker's payout
 * account. Requires a bearer token. After a 502 or a lost response, retry with
 * the same idempotency key: the server resumes the attempt and never pays twice.
 */
export const POST = payoutAction(getPayoutDependencies, async (dependencies, userId, request) =>
  dependencies.withdrawals.forBooker(parseWithdrawInput(userId, await readJsonBody(request))),
);
