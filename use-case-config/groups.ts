import { createNotificationPublisher } from "./notification-publisher";
import { randomBytes, randomUUID } from "node:crypto";
import { supabaseGroupStore } from "@/lib/supabase/group-store";
import { supabasePlayerDirectory } from "@/lib/supabase/player-directory";
import { ManageGroup } from "@/use-cases/groups/manage-group";

/** UC1-06: a ManageGroup backed by Supabase, for group pages and server actions. SERVER ONLY. */
export function createManageGroup(): ManageGroup {
  const { groups, queries } = supabaseGroupStore(createNotificationPublisher());
  return new ManageGroup({
    groups,
    queries,
    newId: () => randomUUID(),
    // 32 random bytes → a 43-character link code that nobody can guess.
    newInvitationToken: () => randomBytes(32).toString("base64url"),
    now: () => new Date(),
    // Inviting by user ID (ADR-0022) finds the player over the same service-role client.
    players: supabasePlayerDirectory(),
  });
}
