import { withdrawalPreviewGetAction } from "@/app/commit/withdrawal-preview-action";
import { parseWithdrawalPreviewSessionId } from "@/app/commit/withdrawal-preview-input";

export const runtime = "nodejs";

/** UC2-05: what withdrawing now would refund, without saving or moving funds. */
export const GET = withdrawalPreviewGetAction({
  parse: (userId, params) => ({
    userId,
    sessionId: parseWithdrawalPreviewSessionId(params.sessionId),
  }),
  run: (dependencies, input) => dependencies.previewWithdrawal.forParticipant(input.userId, input.sessionId),
});
