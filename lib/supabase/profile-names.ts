import { createAdminClient } from "./admin";

/** How a group member is shown: their name, and their user ID while the account is active. */
export interface MemberProfile {
  readonly name: string;
  /** The public user ID without "@" (ADR-0021); null for a deleted account. */
  readonly handle: string | null;
}

/**
 * Names and user IDs for a list of users, e.g. the members of a group. SERVER ONLY.
 * Deleted accounts (UC1-04) show as "Deleted user" with no ID; a blank name shows as "Unnamed player".
 */
export async function memberProfiles(userIds: readonly string[]): Promise<Map<string, MemberProfile>> {
  const profiles = new Map<string, MemberProfile>();
  if (userIds.length === 0) return profiles;

  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("user_id, display_name, account_status, handle")
    .in("user_id", [...userIds]);
  if (error !== null) throw error;

  for (const row of data) {
    if (row.account_status === "INACTIVE") {
      profiles.set(row.user_id, { name: "Deleted user", handle: null });
      continue;
    }
    const name = typeof row.display_name === "string" ? row.display_name.trim() : "";
    const handle = typeof row.handle === "string" && row.handle !== "" ? row.handle : null;
    profiles.set(row.user_id, { name: name || "Unnamed player", handle });
  }
  return profiles;
}
