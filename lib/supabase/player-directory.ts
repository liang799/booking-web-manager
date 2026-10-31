import type { UserDirectory } from "@/use-cases/accounts/user-handles";
import { createAdminClient } from "./admin";
import { userSummaryFromRow } from "./postgres-user-directory";

/**
 * Finds the ACTIVE player holding exactly a user ID, for inviting them to a group
 * (ADR-0022). It reads over the service-role client the group store already uses, so
 * group pages and actions need no database pool. SERVER ONLY.
 */
export function supabasePlayerDirectory(): Pick<UserDirectory, "findActiveByHandle"> {
  const admin = createAdminClient();
  return {
    async findActiveByHandle(handle) {
      const { data, error } = await admin
        .from("profiles")
        .select("user_id, handle, display_name")
        .eq("handle", handle.toString())
        .eq("account_status", "ACTIVE")
        .maybeSingle();
      if (error !== null) throw error;
      return data === null ? null : userSummaryFromRow(data);
    },
  };
}
