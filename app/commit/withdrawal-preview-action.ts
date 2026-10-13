import { createAuthenticatedActions } from "@/app/http/authenticated-action";
import { getWithdrawalPreviewDependencies } from "./withdrawal-preview-server-dependencies";
import { withdrawalPreviewErrorResponse } from "./withdrawal-preview-response";

const actions = createAuthenticatedActions({
  getDependencies: getWithdrawalPreviewDependencies,
  errorResponse: withdrawalPreviewErrorResponse,
});

/** Authenticated preview policy, including the withdrawal-specific error mapping. */
export const withdrawalPreviewGetAction = actions.get;
